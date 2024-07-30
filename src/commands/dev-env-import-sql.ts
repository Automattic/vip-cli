import chalk from 'chalk';
import fs from 'fs';
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
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import UserError from '../lib/user-error';
import { makeTempDir } from '../lib/utils';
import { validate as validateSQL, validateImportFileExtension } from '../lib/validations/sql';

export interface DevEnvImportSQLOptions {
	skipReindex?: string;
	searchReplace?: string;
	inPlace: boolean;
	skipValidate: boolean;
	quiet: boolean;
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
		const resolvedPath = await resolveImportPath(
			this.slug,
			this.fileName,
			isMyDumper ? [] : searchReplace,
			inPlace
		);

		if ( ! this.options.skipValidate ) {
			if ( ! ( await isEnvUp( lando, getEnvironmentPath( this.slug ) ) ) ) {
				throw new UserError( 'Environment needs to be started first' );
			}

			const expectedDomain = `${ this.slug }.${ lando.config.domain }`;
			await validateSQL( resolvedPath, {
				isImport: false,
				skipChecks: [],
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
			await exec( lando, this.slug, importArg, { stdio: [ fd, 'pipe', 'pipe' ] } );

			if ( ! this.options.quiet ) {
				console.log( `${ chalk.green.bold( 'Success:' ) } Database imported.` );
			}
		} finally {
			process.stdin.isTTY = origIsTTY;
		}

		if ( searchReplace?.length && ! inPlace ) {
			fs.unlinkSync( resolvedPath );
		}

		if ( isMyDumper && searchReplace?.length ) {
			for ( const pair of searchReplace ) {
				const [ from, to ] = pair.split( ',' ).map( item => item.trim() );
				// TODO: Investigate if it's worth it to refactor everything to only use wp's version of wp search-replace
				// eslint-disable-next-line no-await-in-loop
				await exec( lando, this.slug, [
					'wp',
					'search-replace',
					'--all-tables',
					`//${ from }`,
					`//${ to }`,
					'--skip-plugins',
					'--skip-themes',
				] );
			}
		}

		const cacheArg = [ 'wp', 'cache', 'flush', '--skip-plugins', '--skip-themes' ].concat(
			this.options.quiet ? '--quiet' : []
		);
		await exec( lando, this.slug, cacheArg );

		if (
			undefined === this.options.skipReindex ||
			! processBooleanOption( this.options.skipReindex )
		) {
			try {
				await exec( lando, this.slug, [ 'wp', 'cli', 'has-command', 'vip-search' ] );
				await exec( lando, this.slug, [
					'wp',
					'vip-search',
					'index',
					'--setup',
					'--network-wide',
					'--skip-confirm',
				] );
			} catch {
				// Exception means they don't have vip-search enabled.
			}
		}

		const addUserArg = [
			'wp',
			'dev-env-add-admin',
			'--username=vipgo',
			'--password=password',
			'--skip-plugins',
			'--skip-themes',
		].concat( this.options.quiet ? '--quiet' : [] );
		await exec( lando, this.slug, addUserArg );
	}

	public getImportArgs( dumpDetails: SqlDumpDetails ) {
		let importArg = [ 'db', '--disable-auto-rehash' ].concat(
			this.options.quiet ? '--silent' : []
		);
		const threadCount = Math.max( os.cpus().length - 2, 1 );
		if ( dumpDetails.type === SqlDumpType.MYDUMPER ) {
			importArg = [
				'db-myloader',
				'--overwrite-tables',
				`--threads=${ threadCount }`,
				'--max-threads-for-schema-creation=10',
				'--max-threads-for-index-creation=10',
				'--skip-triggers',
				'--skip-post',
				'--checksum="SKIP"',
				'--metadata-refresh-interval=2000000',
				'--stream',
				'--source-db',
				dumpDetails.sourceDb,
			].concat( this.options.quiet ? [ '--verbose=0' ] : [ '--verbose=3' ] );
		}

		return importArg;
	}
}
