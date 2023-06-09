import xdgBasedir from 'xdg-basedir';
import os from 'os';
import crypto from 'crypto';
import fs, { ReadStream } from 'fs';
import path, { dirname } from 'path';
import gql from 'graphql-tag';
import API from '../../lib/api';
import {
	GetAppBackupsV2Query,
	GetAppBackupsV2QueryVariables,
	GetBackupCopiesQuery,
	GetBackupCopiesQueryVariables
} from './backup-copy-manager.generated';
import { Select } from 'enquirer';
import { getFolderSize } from '../utils';
import {
	Configuration,
	Manifest,
	RemoteBackup,
	RemoteBackupCopy,
	RemoteBackupDetails, RemoteBackupRaw
} from './types';

const permissions = [
	'backup-download:start',
	'backup-download:generate-url'
];

const backupsQuery = gql`
	query GetAppBackupsV2(
		$appId: Int!
		$environmentId: Int!
		$permissions: [String] = []
	) {
		app(id: $appId) {
			id
			environments(id: $environmentId) {
				backups {
					total
					nextCursor
					nodes {
						createdAt
						id
						environmentId
						type
						size
						filename
						dataset {
							displayName
						}
					}
				}
				permissions(permissions: $permissions) {
					permission
					isAllowed
				}
			}
		}
	}
`;

const backupsCopyQuery = gql`
	query GetBackupCopies(
		$appId: Int!
		$environmentId: Int!
	) {
		app(id: $appId) {
			environments(id: $environmentId) {
				dbBackupCopies {
					nextCursor
					nodes {
						id
						filePath
						config {
							backupLabel
							networkSiteId
							siteId
							tables
							#					TODO: Add backupId as well 
						}
					}
				}
			}
		}
	}
`;

export enum BackupConfiguration {
	SINGLE = 'SINGLE', // single site out of a multi-site
	PARTIAL = 'PARTIAL', // table-based backup
	FULL = 'FULL', // all tables
}

export enum BackupLabel {
	SINGLE = 'network-site',
	PARTIAL = 'specific-tables',
	FULL = ''
}

const backupConfigurationToLabel: Record<BackupConfiguration, BackupLabel> = {
	[ BackupConfiguration.SINGLE ]: BackupLabel.SINGLE,
	[ BackupConfiguration.PARTIAL ]: BackupLabel.PARTIAL,
	[ BackupConfiguration.FULL ]: BackupLabel.FULL,
};

const backupLabelToConfiguration: Record<BackupLabel, BackupConfiguration> = Object.keys( backupConfigurationToLabel ).reduce( ( dictionary, key: string ) => {
	const config = key as unknown as BackupConfiguration;
	const label = backupConfigurationToLabel[ config ];
	dictionary[ label ] = config;

	return dictionary;
}, {} as Record<BackupLabel, BackupConfiguration> );

const MANIFEST_FILE_NAME = 'manifest.json';

/**
 * Creates a manager for handling backups and backup copies that are either at remote or local to the machine.
 * Generally you'd want to call one of the factory methods, and use the available methods to do some sort of processing.
 *
 * For example, let's say you want to select a backup, generate a backup copy for it, then copy it into your local env db. The steps would be as follows:
 *
 * 1. Call the select remote backup prompt
 * 2. Somehow create a backup copy. The prompt gives you enough info for you to generate a backup copy
 * 3. Then, generate a download link of that backup copy, then download the link into a stream.
 * 4. Call the writeBackupCopyToFile method.
 * 5.
 */
export class BackupCopyManager {
	private _manifest?: Manifest;
	appId: number;
	envId: number;
	configuration: Configuration;
	// useful for finding out which one was the most recently downloaded import
	downloadedAt?: string | null;
	// useful for finding out which was the most recently imported backup copy cache (hence, the copy)
	cacheImportedAt?: string | null;
	// useful for finding out which was the most recent backup that was generated at
	backupCreatedAt?: string | null;
	// useful for finding out which was the most recent backup that was generated at
	backupCopyCreatedAt?: string | null;
	// not sure how this can be useful yet.
	cacheUpdatedAt?: string | null;

	constructor( appId: number, envId: number, configuration: Configuration ) {
		this.appId = appId;
		this.envId = envId;
		this.configuration = configuration;
	}

	static createForFullBackup( appId: number, envId: number ) {
		return new BackupCopyManager( appId, envId, {
			backupConfiguration: BackupConfiguration.FULL
		} );
	}

	static async createFromManifestPath( manifestPath: string ) {
		const buffer = await fs.promises.readFile( manifestPath );
		const manifest = JSON.parse( buffer.toString() ) as Manifest;

		return BackupCopyManager.createFromManifest( manifest );
	}

	static createFromManifest( manifest: Manifest ) {
		const {
			app_id,
			backup_id,
			env_id,
			site_id,
			network_site_id,
			backup_label,
			tables,
			cache_imported_at,
			backup_created_at,
			backup_copy_created_at,
			downloaded_at,
			cache_updated_at
		} = manifest;
		const manager = new BackupCopyManager( app_id, env_id, {
			backupConfiguration: backupLabelToConfiguration[ backup_label ],
			backupId: backup_id,
			tables: tables,
			networkSiteId: network_site_id || undefined
		} );
		manager.cacheImportedAt = cache_imported_at;
		manager.downloadedAt = downloaded_at;
		manager.backupCreatedAt = backup_created_at;
		manager.backupCopyCreatedAt = backup_copy_created_at;

		return manager;
	}

	updateDownloadedAt() {
		this.downloadedAt = new Date().toISOString();
	}

	updateCacheImportedAt() {
		this.cacheImportedAt = new Date().toISOString();
	}

	updateCacheUpdatedAt() {
		this.cacheUpdatedAt = new Date().toISOString();
	}

	updateBackupCreatedAt( timestamp: string ) {
		this.backupCreatedAt = new Date( timestamp ).toISOString();
	}

	updateBackupCopyCreatedAt( timestamp: string ) {
		this.backupCopyCreatedAt = new Date( timestamp ).toISOString();
	}

	validateManifestGeneration() {
		if ( this.configuration.backupId ) {
			throw new Error( 'Manifest generation failed: configuration.backupId is not set' );
		}

		const requiredFields = [
			'downloadedAt',
			'cacheImportedAt',
			'backupCreatedAt',
			'backupCopyCreatedAt',
			'cacheUpdatedAt',
			'backupId'
		];

		requiredFields.forEach( field => {
			if ( ! (
				this as unknown as Record<string, string>
			)[ field ] ) {
				throw new Error( `Manifest generation failed: ${ field } is not set` );
			}
		} );
	}

	/**
	 * Manifest should only be available on
	 */
	generateManifest(): Manifest {
		this.validateManifestGeneration();

		if ( ! (
			this.configuration.backupId && this.downloadedAt && this.cacheImportedAt && this.backupCreatedAt && this.backupCopyCreatedAt && this.cacheUpdatedAt
		) ) {
			// I'm being pedantic here, validateManifestGeneration should definitely prevent the above fields from being nullish
			throw new Error( 'Manifest generation failed: A field is not set' );
		}

		return {
			backup_label: backupConfigurationToLabel[ this.configuration.backupConfiguration ],
			network_site_id: this.configuration.networkSiteId ?? null,
			site_id: this.envId,
			app_id: this.appId,
			env_id: this.envId,
			tables: this.configuration.tables ?? [],
			downloaded_at: this.downloadedAt,
			cache_imported_at: this.cacheImportedAt,
			backup_id: this.configuration.backupId,
			backup_created_at: this.backupCreatedAt,
			backup_copy_created_at: this.backupCopyCreatedAt,
			cache_updated_at: this.cacheUpdatedAt,
		};
	}

	async writeFileAndRecursivelyCreateFolders( filePath: string, data: Parameters<typeof fs.promises.writeFile>[1] ) {
		// TODO: This can be generalized so that everyone could use it.
		await fs.promises.mkdir( dirname( filePath ) );
		await fs.promises.writeFile( filePath, data );
	}

	/**
	 * Gets the root folder where all the cache is stored
	 */
	static getCachesFolder() {
		const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();
		const cacheFilePath = path.join( mainEnvironmentPath, 'vip', 'backup-copy-cache' );

		return cacheFilePath;
	}

	getCachePath() {
		return path.resolve( BackupCopyManager.getCachesFolder(), `${ this.appId }-${ this.envId }-${ this.getCacheHash() }` );
	}

	getCacheHash(): string {
		const payload = { ...this.configuration };
		if ( payload.tables ) {
			payload.tables = [ ...payload.tables ].sort();
		}

		const hash = crypto.createHash( 'md5' );
		hash.update( JSON.stringify( payload ) );

		return hash.digest( 'hex' );
	}

	getBackupCopyPath() {
		return path.join( this.getCachePath(), 'backup-copy.sql.gz' );
	}

	async writeBackupCopyToFile( readStream: ReadStream ) {
		await this.writeFileAndRecursivelyCreateFolders( this.getBackupCopyPath(), readStream );
	}

	getManifestPath() {
		return path.join( this.getCachePath(), MANIFEST_FILE_NAME );
	}

	async writeManifestToFile() {
		await this.writeFileAndRecursivelyCreateFolders( this.getManifestPath(), JSON.stringify( this.generateManifest() ) );
	}

	async readManifestFromFile( cached = true ): Promise<Manifest> {
		if ( cached && this._manifest ) {
			return this._manifest;
		}

		const buffer = await fs.promises.readFile( this.getManifestPath() );
		this._manifest = JSON.parse( buffer.toString() ) as Manifest;
		return this._manifest;
	}

	getManifest(): Manifest {
		if ( ! this._manifest ) {
			throw new Error( 'Manifest is not populated yet. Please run readManifestFromFile first' );
		}

		return this._manifest;
	}

	getBackupCopyStream(): ReadStream {
		return fs.createReadStream( this.getBackupCopyPath() );
	}

	getProcessedSqlPath() {
		return path.join( this.getCachePath(), 'processed.sql' );
	}

	async writeProcessedSqlToFile( readStream: ReadStream ) {
		await this.writeFileAndRecursivelyCreateFolders( this.getProcessedSqlPath(), readStream );
	}

	static async cleanUpBrokenCaches() {
		const folders = await fs.promises.readdir( BackupCopyManager.getCachesFolder() );
		await Promise.all( folders.map( async folder => {
			const manifestPath = path.join( folder, MANIFEST_FILE_NAME );
			try {
				await fs.promises.access( manifestPath );
			} catch ( e ) {
				await fs.promises.rm( folder, { recursive: true } );
			}
		} ) );
	}

	static async getAllCachedBackupCopyManagers(): Promise<BackupCopyManager[]> {
		const folders = await fs.promises.readdir( BackupCopyManager.getCachesFolder() );
		return await Promise.all( folders.map( async folder => {
			const manifestPath = path.join( folder, MANIFEST_FILE_NAME );
			return await BackupCopyManager.createFromManifestPath( manifestPath );
		} ) );
	}

	async getCachedBackupCopyManagers(): Promise<BackupCopyManager[]> {
		const managers = await BackupCopyManager.getAllCachedBackupCopyManagers();
		return managers.filter( manager => manager.envId === this.envId );
	}

	getProcessedSqlStream() {
		return fs.createReadStream( this.getProcessedSqlPath() );
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async getRemoteBackupCopyStream() {
		// TODO: This is currently implemented elsewhere and I think it's better to have it here.
		// The problem is, there's significant work required for creating a backup copy itself.
		throw new Error( 'Not implemented yet' );
	}

	async getRemoteBackups(): Promise<RemoteBackupDetails[]> {
		// TODO: Properly paginate as we're returning everything currently
		const api = await API();
		// everything is stored in UTC in our back-end
		// but JS date APIs are in local timezone
		const today = new Date();
		const tomorrow = new Date( new Date().setDate( today.getDate() + 1 ) );
		// we select tomorrow for users that are behind UTC
		const tomorrowDate = tomorrow.toISOString().split( 'T' )[ 0 ];
		// for now, many days ago is for 30 days ago
		const manyDaysAgo = new Date( new Date().setDate( today.getDate() - 31 ) );
		const manyDaysAgoDate = manyDaysAgo.toISOString().split( 'T' )[ 0 ];

		const variables: GetAppBackupsV2QueryVariables = {
			appId: this.appId,
			environmentId: this.envId,
			permissions
		};

		const { data } = await api.query<GetAppBackupsV2Query, GetAppBackupsV2QueryVariables>( {
			query: backupsQuery,
			fetchPolicy: 'network-only',
			variables
		} );

		const backupsResponse = data.app?.environments?.[ 0 ]?.backups?.nodes || [];
		return backupsResponse.reduce( ( backups, backupResponse ) => {
			if ( backupResponse?.createdAt && backupResponse?.id && backupResponse?.filename ) {
				// The schema says that these fields as optional even if it can never be optional
				// I'm tempted to just use the ! operator but that'll trigger eslint
				backups.push( {
					processed: {
						createdAt: backupResponse.createdAt,
						id: backupResponse.id,
						size: backupResponse.size || null,
						displayName: backupResponse.createdAt,
						filename: backupResponse.filename
					},
					raw: backupResponse
				} );
			}

			return backups;
		}, [] as RemoteBackupDetails[] );
	}

	async getRemoteBackupCopies(): Promise<RemoteBackupCopy[]> {
		// TODO: Properly paginate as we're returning everything currently. For now it's ok as backup copies expire in a day or a few days.
		// and we don't expect there to be too many, anyway.
		const api = await API();

		const variables: GetBackupCopiesQueryVariables = {
			environmentId: this.envId,
			appId: this.appId
		};

		const { data } = await api.query<GetBackupCopiesQuery, GetBackupCopiesQueryVariables>( {
			query: backupsCopyQuery,
			variables
		} );

		const backupCopiesResponse = data.app?.environments?.[ 0 ]?.dbBackupCopies?.nodes || [];
		return backupCopiesResponse.reduce( ( backupCopies, response ) => {
			if ( ! response.config ) {
				return backupCopies;
			}

			backupCopies.push( {
				id: null, // TODO: could we get an ID here too?
				backupId: null, // TODO: The API is missing this ID
				backupLabel: response.config.backupLabel,
				environmentId: this.envId,
				filePath: response.filePath,
				networkSiteId: response.config.networkSiteId || null,
				appId: this.appId
			} );

			return backupCopies;
		}, [] as RemoteBackupCopy[] );
	}

	async promptSelectFromRemoteBackups( promptMessage = 'Select a backup to download' ): Promise<RemoteBackupDetails> {
		const remoteBackups = await this.getRemoteBackups();
		const prompt = new Select( {
			message: promptMessage,
			choices: remoteBackups.map( ( backup, index ) => {
				return {
					name: backup.processed.displayName,
					value: String( index )
				};
			} ),
			result( value ) {
				return this.focused?.value;
			}
		} );
		const answerIndex = await prompt.run();
		const remoteBackup = remoteBackups[ Number( answerIndex ) ];

		return remoteBackup;
	}

	async promptSelectFromCachedBackupCopies( promptMessage = 'Select a cached backup copy to sync from' ): Promise<BackupCopyManager> {
		const cachedBackupCopyManagers = await this.getCachedBackupCopyManagers();

		await Promise.all( cachedBackupCopyManagers.map( manager => manager.readManifestFromFile() ) );

		const prompt = new Select( {
			message: promptMessage,
			choices: cachedBackupCopyManagers.map( ( backupCopyManager, index ) => {
				return {
					name: `Dated ${ backupCopyManager.getManifest().backup_created_at || '' }, last imported at ${ backupCopyManager.getManifest().cache_imported_at || '' }`,
					value: String( index )
				};
			} ),
			result( value ) {
				return this.focused?.value;
			}
		} );

		const answer = await prompt.run();
		return cachedBackupCopyManagers[ Number( answer ) ];
	}

	async promptSelectRemoteBackupCopy( promptMessage = 'Select a backup copy that has been generated previously' ): Promise<RemoteBackupCopy> {
		const remoteBackupCopies = await this.getRemoteBackupCopies();
		const prompt = new Select( {
			name: 'remoteBackupCopy',
			message: promptMessage,
			choices: remoteBackupCopies.map( ( backupCopy, index ) => {
				return {
					title: backupCopy.filePath,
					value: String( index )
				};
			} )
		} );

		const answer = await prompt.run();
		return remoteBackupCopies[ Number( answer ) ];
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async extendRemoteBackupCopyExpiration() {
		// TODO: No API yet to implement this
		throw new Error( 'Not implemented yet' );
	}

	async deleteCache(): Promise<void> {
		await fs.promises.rmdir( this.getCachePath() );
	}

	/**
	 * Sort backup copy managers by the default way, that is:
	 *
	 * The first one is the most recently imported file
	 * All the others are sorted by the date the backup was created. in descending order
	 *
	 *
	 * @param managers
	 */
	static sortByDefaultInPlace( managers: BackupCopyManager[] ): void {
		let latestDate = new Date( 0 );
		let latestIndex: number | null = null;

		managers.forEach( ( manager, index ) => {
			if ( ! manager.cacheImportedAt ) {
				return;
			}

			const cacheImportedAtDate = new Date( manager.cacheImportedAt );
			if ( cacheImportedAtDate.getTime() > latestDate.getTime() ) {
				latestDate = cacheImportedAtDate;
				latestIndex = index;
			}
		} );

		const mostRecentlyImported = latestIndex === null ? null : managers[ latestIndex ];

		managers.sort( ( a, b ) => {
			// assuming we want b to be at the top and a at the bottom at the end, then whenever a is bigger, we return -1, and when b is bigger, we return 1
			if ( a === mostRecentlyImported ) {
				return - 1;
			}

			if ( b === mostRecentlyImported ) {
				return 1;
			}

			if ( a.backupCreatedAt && b.backupCreatedAt ) {
				return new Date( b.backupCreatedAt ).getTime() - new Date( a.backupCreatedAt ).getTime();
			}

			if ( a.backupCreatedAt && ! b.backupCreatedAt ) {
				return - 1;
			}

			if ( b.backupCreatedAt && ! a.backupCreatedAt ) {
				return 1;
			}

			if ( ! a.backupCreatedAt && ! b.backupCreatedAt ) {
				return 0;
			}

			return 0;
		} );
	}

	static async cleanUpCache( maxCount = 10, maxSizeGB = 10 ) {
		await BackupCopyManager.cleanUpBrokenCaches();
		const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;
		const managers = await BackupCopyManager.getAllCachedBackupCopyManagers();

		// sort in descending import date
		BackupCopyManager.sortByDefaultInPlace( managers );

		const cachesExceedingMaxLimit = managers.slice( maxCount );
		await Promise.all( cachesExceedingMaxLimit.map( cache => cache.deleteCache() ) );
		const cachesWithinMaxCount = managers.slice( 0, maxCount );
		let numberOfCachesBeforeSizeLimitReached = 1;
		let totalSize = 0;
		for ( let i = 0; i < cachesWithinMaxCount.length; i ++ ) {
			const cache = cachesWithinMaxCount[ i ];

			// we need the following to be done sequentially, so we have to await in a loop
			// eslint-disable-next-line no-await-in-loop
			totalSize += await getFolderSize( cache.getCachePath() );

			if ( totalSize > maxSizeBytes ) {
				numberOfCachesBeforeSizeLimitReached = i + 1;
				break;
			}
		}

		const cachesExceedingMaxSize = managers.slice( numberOfCachesBeforeSizeLimitReached );

		await Promise.all( cachesExceedingMaxSize.map( cache => cache.deleteCache() ) );
	}
}
