#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

import fs from 'fs';
import chalk from 'chalk';
import urlLib from 'url';
import { replace } from '@automattic/vip-search-replace';

/**
 * Internal dependencies
 */

import { unzipFile } from '../lib/client-file-uploader';
import { ExportSQLCommand } from './export-sql';
import { makeTempDir } from '../lib/utils';
import { getReadInterface } from '../lib/validations/line-by-line';
import * as exit from '../lib/cli/exit';
import { DevEnvImportSQLCommand } from './dev-env-import-sql';

/**
 * Finds the site home url from the SQL line
 *
 * @param {string} sql A line in a SQL file
 * @return {string} Site home url. null if not found
 */
function findSiteHomeUrl( sql ) {
	const regex = "'(siteurl|home)',\\s?'(.*?)'";
	const results = sql.match( regex );

	if ( results ) {
		const url = results[ 2 ];
		return urlLib.parse( url ).hostname;
	}

	return null;
}

/**
 * Extracts a list of site urls from the SQL file
 *
 * @param {string} sqlFile Path to the SQL file
 * @return {Promise<string[]>} List of site urls
 * @throws {Error} If there is an error reading the file
 */
async function extractSiteUrls( sqlFile ) {
	const readInterface = await getReadInterface( sqlFile );

	return new Promise( ( resolve, reject ) => {
		const domains = new Set();
		readInterface.on( 'line', line => {
			const domain = findSiteHomeUrl( line );
			if ( domain ) {
				domains.add( '//' + domain );
			}
		} );

		readInterface.on( 'close', () => {
			resolve( [ ...domains ] );
		} );

		readInterface.on( 'error', reject );
	} );
}

export class DevEnvSyncSQLCommand {
	app;
	env;
	slug;
	tmpDir;
	siteUrls;

	/**
	 * Creates a new instance of the command
	 *
	 * @param {string} app  The app object
	 * @param {string} env  The environment object
	 * @param {string} slug The site slug
	 */
	constructor( app, env, slug ) {
		this.app = app;
		this.env = env;
		this.slug = slug;
		this.tmpDir = makeTempDir();
	}

	get landoDomain() {
		return `//${ this.slug }.vipdev.lndo.site`;
	}

	get sqlFile() {
		return `${ this.tmpDir }/sql-export.sql`;
	}

	get gzFile() {
		return `${ this.tmpDir }/sql-export.sql.gz`;
	}

	/**
	 * Runs the SQL export command to generate the SQL export from
	 * the latest backup
	 *
	 * @return {Promise<void>} Promise that resolves when the export is complete
	 */
	async generateExport() {
		const exportCommand = new ExportSQLCommand( this.app, this.env, this.gzFile );
		await exportCommand.run();
	}

	/**
	 * Runs the search-replace operation on the SQL file
	 * to replace the site urls with the lando domain
	 *
	 * @return {Promise<void>} Promise that resolves when the search-replace is complete
	 * @throws {Error} If there is an error reading the file
	 */
	async runSearchReplace() {
		const replacements = this.siteUrls.reduce( ( acc, url ) => [ ...acc, url, this.landoDomain ], [] );
		const readStream = fs.createReadStream( this.sqlFile );
		const replacedStream = await replace( readStream, replacements );

		const outputFile = `${ this.tmpDir }/sql-export-sr.sql`;
		replacedStream.pipe( fs.createWriteStream( outputFile ) );

		return new Promise( ( resolve, reject ) => {
			replacedStream.on( 'finish', () => {
				fs.renameSync( outputFile, this.sqlFile );
				resolve();
			} );
			replacedStream.on( 'error', reject );
		} );
	}

	/**
	 * Runs the SQL import command to import the SQL file
	 *
	 * @return {Promise<void>} Promise that resolves when the import is complete
	 * @throws {Error} If there is an error importing the file
	 */
	async runImport() {
		const importOptions = {
			inPlace: true,
			skipValidate: true,
		};
		const importCommand = new DevEnvImportSQLCommand( this.sqlFile, importOptions, this.slug );
		await importCommand.run( true );
	}

	/**
	 * Sequentially runs the commands to export, search-replace, and import the SQL file
	 * to the local environment
	 *
	 * @return {Promise<void>} Promise that resolves when the commands are complete
	 */
	async run() {
		try {
			await this.generateExport();
		} catch ( err ) {
			exit.withError( `Error exporting SQL backup: ${ err?.message }` );
		}

		try {
			console.log( `Extracting the exported file ${ this.gzFile }...` );
			await unzipFile( this.gzFile, this.sqlFile );
			console.log( `${ chalk.green( '✓' ) } Extracted to ${ this.sqlFile }` );
		} catch ( err ) {
			exit.withError( `Error extracting the SQL export: ${ err?.message }` );
		}

		try {
			console.log( 'Extracting site urls from the SQL file...' );
			this.siteUrls = await extractSiteUrls( this.sqlFile );
		} catch ( err ) {
			exit.withError( `Error extracting site URLs: ${ err?.message }` );
		}

		try {
			console.log( 'Running the following search-replace operations on the SQL file:' );
			this.siteUrls.forEach( domain => {
				console.log( `  ${ domain } -> ${ this.landoDomain }` );
			} );
			await this.runSearchReplace();
			console.log( `${ chalk.green( '✓' ) } Search-replace operation is complete` );
		} catch ( err ) {
			exit.withError( `Error replacing domains: ${ err?.message }` );
		}

		try {
			console.log( 'Importing the SQL file...' );
			await this.runImport();
			console.log( `${ chalk.green( '✓' ) } SQL file imported` );
		} catch ( err ) {
			exit.withError( `Error importing SQL file: ${ err?.message }` );
		}
	}
}
