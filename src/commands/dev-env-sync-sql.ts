#!/usr/bin/env node

import { replace } from '@automattic/vip-search-replace';
import chalk from 'chalk';
import debugLib from 'debug';
import fs from 'fs';
import Lando from 'lando';
import { pipeline } from 'node:stream/promises';

import { DevEnvImportSQLCommand, DevEnvImportSQLOptions } from './dev-env-import-sql';
import { ExportSQLCommand } from './export-sql';
import { App, AppEnvironment, Job } from '../graphqlTypes';
import { TrackFunction } from '../lib/analytics/clients/tracks';
import { BackupStorageAvailability } from '../lib/backup-storage-availability/backup-storage-availability';
import * as exit from '../lib/cli/exit';
import { unzipFile } from '../lib/client-file-uploader';
import { fixMyDumperTransform, getSqlDumpDetails, SqlDumpType } from '../lib/database';
import {
	DBLiveCopyConfig,
	downloadFile,
	getDownloadURL,
	startLiveBackupCopy,
} from '../lib/live-backup-copy';
import { makeTempDir } from '../lib/utils';
import { getReadInterface } from '../lib/validations/line-by-line';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

/**
 * Replaces the domain in the given URL
 *
 * @param string str    The URL to replace the domain in.
 * @param string domain The new domain
 * @return The URL with the new domain
 */
const replaceDomain = ( str: string, domain: string ): string =>
	str.replace( /^([^:]+:\/\/)([^:/]+)/, `$1${ domain }` );

/**
 * Strips the protocol from the URL
 *
 * @param string url The URL to strip the protocol from
 * @return The URL without the protocol
 */
function stripProtocol( url: string ): string {
	const parts = url.split( '//', 2 );
	return parts.length > 1 ? parts[ 1 ] : parts[ 0 ];
}

/**
 * Finds the site home url from the SQL line
 *
 * @param sql A line in a SQL file
 * @return Site home url. null if not found
 */
export function findSiteHomeUrl( sql: string ): string | null {
	const regex = /(['"])(?:siteurl|home)\1,\s*\1([Hh][Tt][Tt][Pp][Ss]?:\/\/.+?)\1/;
	const url = regex.exec( sql )?.[ 2 ] ?? '';
	try {
		const parsed = new URL( url );
		return parsed.hostname ? url : null;
	} catch {
		return null;
	}
}

/**
 * Extracts a list of site urls from the SQL file
 *
 * @param sqlFile Path to the SQL file
 * @return  List of site urls
 * @throws {Error} If there is an error reading the file
 */
async function extractSiteUrls( sqlFile: string ): Promise< string[] > {
	const readInterface = await getReadInterface( sqlFile );

	return new Promise( ( resolve, reject ) => {
		const urls: Set< string > = new Set();
		readInterface.on( 'line', line => {
			let url = findSiteHomeUrl( line );
			if ( url ) {
				url = url.replace( /\/$/, '' );
				urls.add( url );
			}
		} );

		readInterface.on( 'close', () => {
			// Soring by length so that longest URLs are replaced first
			resolve( Array.from( urls ).sort( ( url1, url2 ) => url2.length - url1.length ) );
		} );

		readInterface.on( 'error', reject );
	} );
}

export class DevEnvSyncSQLCommand {
	public tmpDir: string;
	public siteUrls: string[] = [];
	public searchReplaceMap: Record< string, string > = {};
	public configFile?: string;
	public _track: TrackFunction;
	private _sqlDumpType?: SqlDumpType;

	/**
	 * Creates a new instance of the command
	 */
	constructor(
		public app: App,
		public env: AppEnvironment,
		public slug: string,
		public lando: Lando,
		trackerFn: TrackFunction = () => {},
		configFile?: string
	) {
		this._track = trackerFn;
		this.tmpDir = makeTempDir();
		this.configFile = configFile;
	}

	public track( name: string, eventProps: Record< string, unknown > ) {
		return this._track( name, {
			...eventProps,
			sqldump_type: this._sqlDumpType,
			live_backup_copy: Boolean( this.configFile ),
		} );
	}

	private get landoDomain(): string {
		return `${ this.slug }.${ this.lando.config.domain }`;
	}

	public get sqlFile(): string {
		return `${ this.tmpDir }/sql-export.sql`;
	}

	public get gzFile(): string {
		return `${ this.tmpDir }/sql-export.sql.gz`;
	}

	private getSqlDumpType(): SqlDumpType {
		if ( ! this._sqlDumpType ) {
			throw new Error( 'SQL Dump type not initialized' );
		}

		return this._sqlDumpType;
	}

	public async initSqlDumpType(): Promise< void > {
		const dumpDetails = await getSqlDumpDetails( this.sqlFile );
		this._sqlDumpType = dumpDetails.type;
	}

	private async confirmEnoughStorage( job: Job ) {
		const storageAvailability = BackupStorageAvailability.createFromDbCopyJob( job );
		return await storageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport();
	}

	/**
	 * Runs the SQL export command to generate the SQL export from
	 * the latest backup
	 */
	public async generateExport(): Promise< void > {
		if ( this.configFile ) {
			await this.generateLiveBackupCopy();

			return;
		}

		const exportCommand = new ExportSQLCommand(
			this.app,
			this.env,
			{ outputFile: this.gzFile, confirmEnoughStorageHook: this.confirmEnoughStorage.bind( this ) },
			this.track.bind( this )
		);
		await exportCommand.run();
	}

	private async generateLiveBackupCopy(): Promise< void > {
		if ( ! this.configFile ) {
			throw new Error( 'Configuration file is required for live backup copy.' );
		}

		if ( ! this.app.id || ! this.env.id ) {
			throw new Error( 'App ID and Environment ID are required to start live backup copy.' );
		}

		const config = JSON.parse( fs.readFileSync( this.configFile, 'utf-8' ) ) as DBLiveCopyConfig;
		if ( ! config.type ) {
			throw new Error( 'Invalid configuration file. Missing tool or type.' );
		}

		try {
			console.log( `${ chalk.green( '✓' ) } Creating backup copy` );

			const copyId = await startLiveBackupCopy( {
				appId: this.app.id,
				environmentId: this.env.id,
				config,
			} );

			const downloadURL = await getDownloadURL( {
				appId: this.app.id,
				environmentId: this.env.id,
				copyId,
			} );

			console.log( `${ chalk.green( '✓' ) } Downloading file` );

			await downloadFile( downloadURL, this.gzFile );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : 'Unknown error';

			await this.track( 'error', {
				error_type: 'live_backup_copy',
				error_message: message,
				stack: err instanceof Error ? err.stack : undefined,
			} );

			exit.withError( `Error creating backup copy: ${ message }` );
		}
	}

	/**
	 * Runs the search-replace operation on the SQL file
	 * to replace the site urls with the lando domain
	 *
	 * @return {Promise<void>} Promise that resolves when the search-replace is complete
	 * @throws {Error} If there is an error reading the file
	 */
	public async runSearchReplace(): Promise< void > {
		const replacements = Object.entries( this.searchReplaceMap ).flat();
		const readStream = fs.createReadStream( this.sqlFile );
		const replacedStream = await replace( readStream, replacements );

		const outputFile = `${ this.tmpDir }/sql-export-sr.sql`;
		const streams: ( NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream )[] = [
			replacedStream,
		];
		if ( this.getSqlDumpType() === SqlDumpType.MYDUMPER ) {
			streams.push( fixMyDumperTransform() );
		}

		streams.push( fs.createWriteStream( outputFile ) );

		await pipeline( streams );

		fs.renameSync( outputFile, this.sqlFile );
	}

	public generateSearchReplaceMap(): void {
		this.searchReplaceMap = {};

		for ( const url of this.siteUrls ) {
			this.searchReplaceMap[ stripProtocol( url ) ] = stripProtocol(
				replaceDomain( url, this.landoDomain )
			);
		}

		const networkSites = this.env.wpSitesSDS?.nodes;
		if ( ! networkSites ) return;

		const primaryUrl = networkSites.find( site => site?.blogId === 1 )?.homeUrl;
		const primaryDomain = primaryUrl ? new URL( primaryUrl ).hostname : '';
		debug(
			'Network sites: %j, primary URL: %s, primary domain: %s',
			networkSites.map( site => ( { blogId: site?.blogId, homeUrl: site?.homeUrl } ) ),
			primaryUrl,
			primaryDomain
		);

		for ( const site of networkSites ) {
			if ( ! site?.blogId || site.blogId === 1 ) continue;

			const url = site?.homeUrl;
			if ( ! url ) continue;

			const strippedUrl = stripProtocol( url ).replace( /\/$/, '' );
			if ( ! this.searchReplaceMap[ strippedUrl ] ) continue;

			const domain = new URL( url ).hostname;
			const newDomain =
				primaryDomain === domain
					? this.landoDomain
					: `${ this.slugifyDomain( domain ) }.${ this.landoDomain }`;

			this.searchReplaceMap[ stripProtocol( url ) ] = stripProtocol(
				replaceDomain( url, newDomain )
			);
		}
	}

	private slugifyDomain( domain: string ): string {
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
	public async runImport(): Promise< void > {
		const importOptions: DevEnvImportSQLOptions = {
			inPlace: true,
			skipValidate: true,
			quiet: true,
			postImportSQL: this.fixBlogsTableQuery(),
		};
		const importCommand = new DevEnvImportSQLCommand( this.sqlFile, importOptions, this.slug );
		await importCommand.run();
	}

	private fixBlogsTableQuery() {
		const networkSites = this.env.wpSitesSDS?.nodes;
		if ( ! networkSites ) {
			return '';
		}

		const prologue = `
DROP PROCEDURE IF EXISTS vip_sync_update_blog_domains;
DELIMITER $$
CREATE PROCEDURE vip_sync_update_blog_domains()
BEGIN
    IF EXISTS (SELECT * FROM information_schema.tables WHERE table_schema = 'wordpress' AND table_name = 'wp_blogs') THEN
`;
		const epilogue = `
    END IF;
END$$
DELIMITER ;
CALL vip_sync_update_blog_domains();
DROP PROCEDURE vip_sync_update_blog_domains;
`;

		const primaryUrl = networkSites.find( site => site?.blogId === 1 )?.homeUrl;
		const primaryDomain = primaryUrl ? new URL( primaryUrl ).hostname : '';

		const queries: string[] = [];
		for ( const site of networkSites ) {
			if ( ! site?.blogId || ! site?.homeUrl ) {
				continue;
			}

			const oldDomain = new URL( site.homeUrl ).hostname;
			const newDomain =
				primaryDomain !== oldDomain
					? `${ this.slugifyDomain( oldDomain ) }.${ this.landoDomain }`
					: this.landoDomain;

			queries.push(
				`        UPDATE wp_blogs SET domain = '${ newDomain }' WHERE blog_id = ${ Number(
					site.blogId
				) };`
			);
		}

		if ( queries.length === 0 ) {
			return '';
		}

		return `${ prologue }\n${ queries.join( '\n' ) }\n${ epilogue }`;
	}

	/**
	 * Sequentially runs the commands to export, search-replace, and import the SQL file
	 * to the local environment
	 *
	 * @return Promise that resolves to true when the commands are complete. It will return false if the user did not continue during validation prompts.
	 */
	public async run(): Promise< boolean > {
		try {
			await this.generateExport();
		} catch ( err ) {
			const error = err as Error;
			// this.generateExport probably catches all exceptions, track the event and runs exit.withError() but if things go really wrong
			// and we have no tracking data, we would at least have it logged here.
			// the following will not get executed if this.generateExport() calls exit.withError() on all exception
			await this.track( 'error', {
				error_type: 'export_sql_backup',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error exporting SQL backup: ${ error.message }` );
		}

		try {
			console.log( `Extracting the exported file ${ this.gzFile }...` );
			await unzipFile( this.gzFile, this.sqlFile );
			await this.initSqlDumpType();
			console.log( `${ chalk.green( '✓' ) } Extracted to ${ this.sqlFile }` );
		} catch ( err ) {
			const error = err as Error;
			await this.track( 'error', {
				error_type: 'archive_extraction',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error extracting the SQL export: ${ error.message }` );
		}

		try {
			console.log( 'Extracting site urls from the SQL file...' );
			this.siteUrls = await extractSiteUrls( this.sqlFile );
			debug( 'Extracted site URLs: %j', this.siteUrls );
		} catch ( err ) {
			const error = err as Error;
			await this.track( 'error', {
				error_type: 'extract_site_urls',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error extracting site URLs: ${ error.message }` );
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
			const error = err as Error;
			await this.track( 'error', {
				error_type: 'search_replace',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error replacing domains: ${ error.message }` );
		}

		try {
			console.log( 'Importing the SQL file...' );
			await this.runImport();
			console.log( `${ chalk.green( '✓' ) } SQL file imported` );
		} catch ( err ) {
			const error = err as Error;
			await this.track( 'error', {
				error_type: 'import_sql_file',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error importing SQL file: ${ error.message }` );
		}

		return true;
	}
}
