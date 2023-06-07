import xdgBasedir from 'xdg-basedir';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import * as Stream from 'stream';
import fs from 'fs/promises';
import fsc, { ReadStream } from 'fs';
import ReadableStream = NodeJS.ReadableStream;
import * as net from 'net';

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

interface Configuration {
	networkSiteId?: number;
	backupConfiguration: BackupConfiguration;
	backupId: string;
	tables?: string[];
}

/**
 * Same structure as our backup copy metadata for compatibility purposes
 */
interface Metadata {
	tables: string[];
	app_id: number;
	env_id: number;
	site_id: number;
	backup_id: string;
	network_site_id: number | null;
	backup_label: BackupLabel;
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

interface Manifest extends Metadata {
	downloaded_at: string | null,
	imported_at: string | null,
	created_at: string | null,
	updated_at: string | null

}

class BackupCopyManager {
	private readonly appId: number;
	private readonly envId: number;
	private readonly configuration: Configuration;
	// useful for finding out which one was the most recently downloaded import
	downloadedAt?: string | null;
	// useful for finding out which was the most recently used import
	importedAt?: string | null;
	// useful for finding out which was the most recent backup
	createdAt?: string | null;
	// not sure how this can be useful yet.
	updatedAt?: string | null;

	constructor( appId: number, envId: number, configuration: Configuration ) {
		this.appId = appId;
		this.envId = envId;
		this.configuration = configuration;
	}

	static createForFullBackup( appId: number, envId: number, backupId: string ) {
		return new BackupCopyManager( appId, envId, {
			backupConfiguration: BackupConfiguration.FULL,
			backupId,
		} );
	}

	static async createFromManifestPath( manifestPath: string ) {
		const buffer = await fs.readFile( manifestPath );
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
			imported_at,
			created_at,
			downloaded_at,
			updated_at
		} = manifest;
		const manager = new BackupCopyManager( app_id, env_id, {
			backupConfiguration: backupLabelToConfiguration[ backup_label ],
			backupId: backup_id,
			tables: tables,
			networkSiteId: network_site_id || undefined
		} );
		manager.importedAt = imported_at;
		manager.downloadedAt = downloaded_at;
		manager.createdAt = created_at;

		return manager;
	}

	onError() {

	}

	generateManifest(): Manifest {
		return {
			backup_label: backupConfigurationToLabel[ this.configuration.backupConfiguration ],
			network_site_id: this.configuration.networkSiteId || null,
			site_id: this.envId,
			app_id: this.appId,
			env_id: this.envId,
			tables: this.configuration.tables || [],
			downloaded_at: this.downloadedAt || null,
			imported_at: this.importedAt || null,
			backup_id: this.configuration.backupId,
			created_at: this.createdAt || null,
			updated_at: this.updatedAt || null,
		};
	}

	/**
	 * Gets the root folder where all the cache is stored
	 */
	static getCacheRootFolder() {
		const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();
		const cacheFilePath = path.join( mainEnvironmentPath, 'vip', 'backup-copy-cache' );

		return cacheFilePath;
	}

	getFolderPath() {
		return path.resolve( BackupCopyManager.getCacheRootFolder(), `${ this.appId }-${ this.envId }-${ this.getCacheHash() }` );
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
		return path.join( this.getFolderPath(), 'backup-copy.sql.gz' );
	}

	async writeBackupCopyToFile( readStream: ReadableStream ) {
		await fs.writeFile( this.getBackupCopyPath(), readStream );
	}

	getManifestPath() {
		return path.join( this.getFolderPath(), MANIFEST_FILE_NAME );
	}

	async writeManifestToFile() {
		await fs.writeFile( this.getManifestPath(), JSON.stringify( this.generateManifest() ) );
	}

	async readManifestFromFile(): Promise<Manifest> {
		const buffer = await fs.readFile( this.getManifestPath() );
		return JSON.parse( buffer.toString() ) as Manifest;
	}

	getBackupCopyStream(): ReadStream {
		return fsc.createReadStream( this.getBackupCopyPath() );
	}

	getProcessedSqlPath() {
		return path.join( this.getFolderPath(), 'processed.sql' );
	}

	async writeSqlToFile( readStream: ReadStream ) {
		await fs.writeFile( this.getProcessedSqlPath(), readStream );
	}

	static async getAllCachedBackupCopyManagers(): Promise<BackupCopyManager[]> {
		const folders = await fs.readdir( BackupCopyManager.getCacheRootFolder() );
		const managers = await Promise.all( folders.map( async folder => {
			const manifestPath = path.join( folder, MANIFEST_FILE_NAME );
			const manager = await BackupCopyManager.createFromManifestPath( manifestPath );

			return manager;
		} ) );

		return managers;
	}

	async getCachedBackupCopyManagers(): Promise<BackupCopyManager[]> {
		const managers = await BackupCopyManager.getAllCachedBackupCopyManagers();
		return managers.filter( manager => manager.envId === this.envId );
	}

	getProcessedSqlStream() {
		return fsc.createReadStream( this.getProcessedSqlPath() );
	}

	async getRemoteBackupStream() {

	}

	async getRemoteBackups() {

	}

	async getRemoteBackupCopies() {

	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async promptSelectCachedBackup(): Promise<BackupCopyManager> {
		throw new Error( 'Not implemented yet' );
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async promptSelectCachedBackupCopies(): Promise<BackupCopyManager> {
		throw new Error( 'Not implemented yet' );
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async promptSelectRemoteBackupCopy(): Promise<BackupCopyManager> {
		throw new Error( 'Not implemented yet' );
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async extendRemoteBackupCopyExpiration() {
		throw new Error( 'Not implemented yet' );
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async cleanUpCache( maxCaches = 10, maxSizeGB = 10 ) {
		throw new Error( 'Not implemented yet' );
	}
}
