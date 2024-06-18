#!/usr/bin/env node

import { replace } from '@automattic/vip-search-replace';
import chalk from 'chalk';
import fs from 'fs';
import urlLib from 'url';

import { DevEnvImportSQLCommand } from './dev-env-import-sql';
import { ExportSQLCommand } from './export-sql';
import { BackupStorageAvailability } from '../lib/backup-storage-availability/backup-storage-availability';
import * as exit from '../lib/cli/exit';
import { unzipFile } from '../lib/client-file-uploader';
import { makeTempDir } from '../lib/utils';
import { getReadInterface } from '../lib/validations/line-by-line';

/**
 * Finds the site home url from the SQL line
 *
 * @param {string} sql A line in a SQL file
 * @return {string} Site home url. null if not found
 */
function findSiteHomeUrl( sql ) {
	const regex = "'(siteurl|home)',\\s?'(.*?)'";
	const url = sql.match( regex )?.[ 2 ] || '';

	return urlLib.parse( url ).hostname || null;
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
				domains.add( domain );
			}
		} );

		readInterface.on( 'close', () => {
			// Soring by length so that longest domains are replaced first
			resolve( Array.from( domains ).sort( ( dom1, dom2 ) => dom2.length - dom1.length ) );
		} );

		readInterface.on( 'error', reject );
	} );
}

export class DevEnvSyncSQLCommand {
	app;
	env;
	slug;
	lando;
	tmpDir;
	siteUrls;
	searchReplaceMap;
	track;

	/**
	 * Creates a new instance of the command
	 *
	 * @param {string}   app       The app object
	 * @param {string}   env       The environment object
	 * @param {string}   slug      The site slug
	 * @param {Object}   lando     The lando object
	 * @param {Function} trackerFn Function to call for tracking
	 */
	constructor( app, env, slug, lando, trackerFn = () => {} ) {
		this.app = app;
		this.env = env;
		this.slug = slug;
		this.lando = lando;
		this.track = trackerFn;
		this.tmpDir = makeTempDir();
	}

	get landoDomain() {
		return `${ this.slug }.${ this.lando.config.domain }`;
	}

	get sqlFile() {
		return `${ this.tmpDir }/sql-export.sql`;
	}

	get gzFile() {
		return `${ this.tmpDir }/sql-export.sql.gz`;
	}

	async confirmEnoughStorage( job ) {
		const storageAvailability = BackupStorageAvailability.createFromDbCopyJob( job );
		return await storageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport();
	}

	/**
	 * Runs the SQL export command to generate the SQL export from
	 * the latest backup
	 */
	async generateExport() {
		const exportCommand = new ExportSQLCommand(
			this.app,
			this.env,
			{ outputFile: this.gzFile, confirmEnoughStorageHook: this.confirmEnoughStorage.bind( this ) },
			this.track
		);
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
		const replacements = Object.entries( this.searchReplaceMap ).flat();
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

	generateSearchReplaceMap() {
		this.searchReplaceMap = {};

		for ( const url of this.siteUrls ) {
			this.searchReplaceMap[ url ] = this.landoDomain;
		}

		const networkSites = this.env.wpSitesSDS.nodes;
		if ( ! networkSites ) return;

		for ( const site of networkSites ) {
			if ( ! site.blogId || site.blogId === 1 ) continue;

			const url = site.homeUrl.replace( /https?:\/\//, '' );
			if ( ! this.searchReplaceMap[ url ] ) continue;

			this.searchReplaceMap[ url ] = `${ this.slugifyDomain( url ) }-${ site.blogId }.${
				this.landoDomain
			}`;
		}
	}

	slugifyDomain( domain ) {
		return String( domain )
			.normalize( 'NFKD' ) // split accented characters into their base characters and diacritical marks
			.replace( /[\u0300-\u036f]/g, '' ) // remove all the accents, which happen to be all in the \u03xx UNICODE block.
			.trim() // trim leading or trailing whitespace
			.toLowerCase() // convert to lowercase
			.replace( /[^a-z0-9 .-]/g, '' ) // remove non-alphanumeric characters except for spaces, dots, and hyphens
			.replace( /[.\s]+/g, '-' ) // replace dots and spaces with hyphens
			.replace( /-+/g, '-' ); // remove consecutive hyphens
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
			quiet: true,
		};
		const importCommand = new DevEnvImportSQLCommand( this.sqlFile, importOptions, this.slug );
		await importCommand.run();
	}

	/**
	 * Sequentially runs the commands to export, search-replace, and import the SQL file
	 * to the local environment
	 *
	 * @return {Promise<void>} Promise that resolves to true when the commands are complete. It will return false if the user did not continue during validation prompts.
	 */
	async run() {
		try {
			await this.generateExport();
		} catch ( err ) {
			// this.generateExport probably catches all exceptions, track the event and runs exit.withError() but if things go really wrong
			// and we have no tracking data, we would at least have it logged here.
			// the following will not get executed if this.generateExport() calls exit.withError() on all exception
			await this.track( 'error', {
				error_type: 'export_sql_backup',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error exporting SQL backup: ${ err?.message }` );
		}

		try {
			console.log( `Extracting the exported file ${ this.gzFile }...` );
			await unzipFile( this.gzFile, this.sqlFile );
			console.log( `${ chalk.green( '✓' ) } Extracted to ${ this.sqlFile }` );
		} catch ( err ) {
			await this.track( 'error', {
				error_type: 'archive_extraction',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error extracting the SQL export: ${ err.message }` );
		}

		try {
			console.log( 'Extracting site urls from the SQL file...' );
			this.siteUrls = await extractSiteUrls( this.sqlFile );
		} catch ( err ) {
			await this.track( 'error', {
				error_type: 'extract_site_urls',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error extracting site URLs: ${ err?.message }` );
		}

		console.log( 'Generating search-replace configuration...' );
		this.generateSearchReplaceMap();

		try {
			console.log( 'Running the following search-replace operations on the SQL file:' );
			for ( const [ domain, landoDomain ] of Object.entries( this.searchReplaceMap ) ) {
				console.log( `  ${ domain } -> ${ landoDomain }` );
			}

			await this.runSearchReplace();
			console.log( `${ chalk.green( '✓' ) } Search-replace operation is complete` );
		} catch ( err ) {
			await this.track( 'error', {
				error_type: 'search_replace',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error replacing domains: ${ err?.message }` );
		}

		try {
			console.log( 'Importing the SQL file...' );
			await this.runImport();
			console.log( `${ chalk.green( '✓' ) } SQL file imported` );
			return true;
		} catch ( err ) {
			await this.track( 'error', {
				error_type: 'import_sql_file',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error importing SQL file: ${ err?.message }` );
		}
	}
}
