// there has to be a better way to do this
// would love to use https://github.com/sindresorhus/type-fest/blob/main/source/get.d.ts
import { GetAppBackupsV2Query } from './backup-copy-manager.generated';
import { BackupConfiguration, BackupLabel } from './backup-copy-manager';

declare const appType: GetAppBackupsV2Query['app'];
const nodeType = appType?.environments?.[ 0 ]?.backups?.nodes?.[ 0 ];

export type RemoteBackupRaw = Exclude<typeof nodeType, null | undefined>

export interface RemoteBackupDetails {
	processed: RemoteBackup,
	raw: RemoteBackupRaw
}

export interface RemoteBackup {
	id: number;
	size: number;
	filename: string;
	displayName: string;
	createdAt: string;
}

export interface RemoteBackupCopy {
	id: number | null; // not implemented
	backupId: number | null; // TODO: Backup copy API is not sending over the backup ID.
	filePath: string;
	backupLabel: string;
	networkSiteId: number | null;
	environmentId: number;
	appId: number;
}

export interface Configuration {
	networkSiteId?: number;
	backupConfiguration: BackupConfiguration;
	backupId?: string;
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

export interface Manifest extends Metadata {
	downloaded_at: string | null,
	cache_imported_at: string | null,
	created_at: string | null,
	cache_updated_at: string | null

}
