import chalk from 'chalk';
import fs from 'fs';
import Lando from 'lando';
import os from 'os';

import * as exit from '../lib/cli/exit';
import { getFileMeta, unzipFile } from '../lib/client-file-uploader';
import { getSqlDumpDetails, SqlDumpDetails, SqlDumpType } from '../lib/database';
import {
	processBooleanOption,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import {
	exec,
	getEnvironmentPath,
	resolveImportPath,
} from '../lib/dev-environment/dev-environment-core';
import {
	addAdminUser,
	dataCleanup,
	executeQuery,
	flushCache,
	reIndexSearch,
} from '../lib/dev-environment/dev-environment-database';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import { searchAndReplace } from '../lib/search-and-replace';
import { trackEvent } from '../lib/tracker';
import UserError from '../lib/user-error';
import { makeTempDir } from '../lib/utils';
import { validate as validateSQL, validateImportFileExtension } from '../lib/validations/sql';

export interface DevEnvImportSQLOptions {
	skipReindex?: string | boolean;
	searchReplace?: string[];
	inPlace: boolean;
	skipValidate: boolean;
	quiet: boolean;
	postImportSQL?: string;
}

export class DevEnvImportSQLCommand {
	constructor(
		private fileName: string,
		private readonly options: DevEnvImportSQLOptions,
		private readonly slug: string
	) {}

	public async run(): Promise< void > {
		const lando = await bootstrapLando();
		validateDependencies( lando );

		validateImportFileExtension( this.fileName );

		const dumpDetails = await getSqlDumpDetails( this.fileName );
		const isMyDumper = dumpDetails.type === SqlDumpType.MYDUMPER;

		// Check if file is compressed and if so, extract the
		const fileMeta = await getFileMeta( this.fileName );
		if ( fileMeta.isCompressed ) {
			const tmpDir = makeTempDir();
			const sqlFile = `${ tmpDir }/sql-import.sql`;

			try {
				if ( ! this.options.quiet ) {
					console.log( `Extracting the compressed file ${ this.fileName }...` );
				}

				await unzipFile( this.fileName, sqlFile );

				if ( ! this.options.quiet ) {
					console.log( `${ chalk.green( '✓' ) } Extracted to ${ sqlFile }` );
				}

				this.fileName = sqlFile;
			} catch ( error ) {
				const err = error as Error;
				exit.withError( `Error extracting the SQL file: ${ err.message }` );
			}
		}

		const { searchReplace, inPlace } = this.options;
		let resolvedPath = resolveImportPath( this.fileName );

		// Run Search and Replace if the --search-replace flag was provided
		// For mydumper files, we use wp search-replace after importing the database
		if ( ! isMyDumper && searchReplace?.length ) {
			try {
				const { outputFileName } = await searchAndReplace( resolvedPath, searchReplace, {
					isImport: true,
					output: true,
					inPlace,
				} );

				if ( typeof outputFileName !== 'string' ) {
					throw new Error(
						'Unable to determine location of the intermediate search & replace file.'
					);
				}

				resolvedPath = outputFileName;
			} catch ( err ) {
				const error = err as Error;

				await trackEvent( 'error', {
					error_type: 'search_replace',
					error_message: error.message,
					stack: error.stack,
				} );
				exit.withError( `Error replacing domains: ${ error.message }` );
			}

			console.log( `${ chalk.green( '✓' ) } Search-replace operation is complete` );
		}

		if ( ! this.options.skipValidate ) {
			if ( ! ( await isEnvUp( lando, getEnvironmentPath( this.slug ) ) ) ) {
				throw new UserError( 'Environment needs to be started first' );
			}

			const expectedDomain = `${ this.slug }.${ lando.config.domain }`;
			await validateSQL( resolvedPath, {
				isImport: false,
				skipChecks: isMyDumper ? [ 'dropTable', 'dropDB' ] : [],
				extraCheckParams: { siteHomeUrlLando: expectedDomain },
			} );
		}

		const fd = await fs.promises.open( resolvedPath, 'r' );
		const importArg = this.getImportArgs( dumpDetails );

		const origIsTTY = process.stdin.isTTY;

		try {
			/**
			 * When stdin is a TTY, Lando passes the `--tty` flag to Docker.
			 * This breaks our code when we pass the stream as stdin to Docker.
			 * exec() then fails with "the input device is not a TTY".
			 *
			 * Therefore, for the things to work, we have to pretend that stdin is not a TTY :-)
			 */
			process.stdin.isTTY = false;
			await exec( lando, this.slug, importArg, { stdio: [ fd.fd, 'pipe', 'pipe' ] } );

			if ( isMyDumper ) {
				await this.executePostSearchReplace( lando );
			}

			if ( ! this.options.quiet ) {
				console.log( `${ chalk.green.bold( 'Success:' ) } Database imported.` );
			}
		} finally {
			process.stdin.isTTY = origIsTTY;
		}

		if ( searchReplace?.length && ! inPlace ) {
			fs.unlinkSync( resolvedPath );
		}

		if ( this.options.postImportSQL ) {
			await executeQuery( lando, this.slug, this.options.postImportSQL );
		}

		await flushCache( lando, this.slug, this.options.quiet );

		if (
			undefined === this.options.skipReindex ||
			! processBooleanOption( this.options.skipReindex )
		) {
			try {
				await reIndexSearch( lando, this.slug );
			} catch {
				// Exception means they don't have vip-search enabled.
			}
		}

		await addAdminUser( lando, this.slug );
		await dataCleanup( lando, this.slug, this.options.quiet );
	}

	public getImportArgs( dumpDetails: SqlDumpDetails ) {
		let importArg = [ 'db', '--disable-auto-rehash' ].concat(
			this.options.quiet ? '--silent' : []
		);
		const threadCount = Math.max( os.cpus().length - 2, 1 );
		if ( dumpDetails.type === SqlDumpType.MYDUMPER ) {
			if ( ! dumpDetails.sourceDb ) {
				console.log(
					`${ chalk.yellow(
						'!'
					) } Unable to identify source DB. Skipping myloader source-db option`
				);
			}

			importArg = [
				'db-myloader',
				'--overwrite-tables',
				...( dumpDetails.sourceDb ? [ `--source-db=${ dumpDetails.sourceDb }` ] : [] ),
				`--threads=${ threadCount }`,
				'--max-threads-for-schema-creation=10',
				'--max-threads-for-index-creation=10',
				'--skip-triggers',
				'--skip-post',
				'--innodb-optimize-keys',
				'--checksum=SKIP',
				'--metadata-refresh-interval=2000000',
				'--stream',
			].concat( this.options.quiet ? [ '--verbose=0' ] : [ '--verbose=3' ] );
		}

		return importArg;
	}

	private async executePostSearchReplace( lando: Lando ): Promise< void > {
		const searchReplace = this.options.searchReplace;
		if ( ! searchReplace ) {
			return;
		}

		for ( const pair of searchReplace ) {
			const [ search, replace ] = pair.split( ',' );

			// eslint-disable-next-line no-await-in-loop
			await exec( lando, this.slug, [
				'wp',
				'search-replace',
				search,
				replace,
				'--all-tables',
				'--report-changed-only',
			] );
		}

		console.log( `${ chalk.green( '✓' ) } Search-replace operation is complete` );
	}
}
