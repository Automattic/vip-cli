/**
 * External dependencies
 */

import fs from 'fs';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { promptForBoolean, validateDependencies } from '../lib/dev-environment/dev-environment-cli';
import {
	getEnvironmentPath,
	resolveImportPath,
	exec,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import UserError from '../lib/user-error';
import { validate as validateSQL, validateImportFileExtension } from '../lib/validations/sql';
import { getFileMeta, unzipFile } from '../lib/client-file-uploader';
import { makeTempDir } from '../lib/utils';
import * as exit from '../lib/cli/exit';

export class DevEnvImportSQLCommand {
	fileName;
	options;
	slug;
	trackingInfo;

	constructor( fileName, options, slug ) {
		this.fileName = fileName;
		this.options = options;
		this.slug = slug;
		this.tmpDir = makeTempDir();
	}

	get sqlFile() {
		return `${ this.tmpDir }/sql-import.sql`;
	}

	async run( silent = false ) {
		const fileMeta = await getFileMeta( this.fileName );

		validateImportFileExtension( this.fileName );

		if ( fileMeta.isCompressed ) {
			try {
				console.log( `Extracting the compressed file ${ this.fileName }...` );
				await unzipFile( this.fileName, this.sqlFile );
				console.log( `${ chalk.green( '✓' ) } Extracted to ${ this.sqlFile }` );
				this.fileName = this.sqlFile;
			} catch ( err ) {
				exit.withError( `Error extracting the SQL file: ${ err.message }` );
			}
		}

		const lando = await bootstrapLando();
		await validateDependencies( lando, this.slug, silent );

		const { searchReplace, inPlace } = this.options;
		const resolvedPath = await resolveImportPath(
			this.slug,
			this.fileName,
			searchReplace,
			inPlace
		);

		if ( ! this.options.skipValidate ) {
			if ( ! ( await isEnvUp( lando, getEnvironmentPath( this.slug ) ) ) ) {
				throw new UserError( 'Environment needs to be started first' );
			}

			const expectedDomain = `${ this.slug }.vipdev.lndo.site`;
			await validateSQL( resolvedPath, {
				isImport: false,
				skipChecks: [],
				extraCheckParams: { siteHomeUrlLando: expectedDomain },
			} );
		}

		const fd = await fs.promises.open( resolvedPath, 'r' );
		const importArg = [ 'db', '--disable-auto-rehash' ];
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

			if ( ! silent ) {
				console.log( `${ chalk.green.bold( 'Success:' ) } Database imported.` );
			}
		} finally {
			process.stdin.isTTY = origIsTTY;
		}

		if ( searchReplace && searchReplace.length && ! inPlace ) {
			fs.unlinkSync( resolvedPath );
		}

		const cacheArg = [ 'wp', 'cache', 'flush' ];
		await exec( lando, this.slug, cacheArg );

		try {
			await exec( lando, this.slug, [ 'wp', 'cli', 'has-command', 'vip-search' ] );
			const doIndex = await promptForBoolean(
				'Do you want to index data in Elasticsearch (used by Enterprise Search)?',
				true
			);
			if ( doIndex ) {
				await exec( lando, this.slug, [
					'wp',
					'vip-search',
					'index',
					'--setup',
					'--network-wide',
					'--skip-confirm',
				] );
			}
		} catch ( err ) {
			// Exception means they don't have vip-search enabled.
		}

		const addUserArg = [ 'wp', 'dev-env-add-admin', '--username=vipgo', '--password=password' ];
		await exec( lando, this.slug, addUserArg );
	}
}
