/**
 * Internal dependencies
 */
import { App, AppEnvironment } from '../../graphqlTypes';
import { GB_IN_BYTES } from '../../lib/constants/file-size';

export const SQL_IMPORT_FILE_SIZE_LIMIT = 100 * GB_IN_BYTES;
export const SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED = 5 * GB_IN_BYTES;

export type AppForImport = Pick< App, 'id' | 'environments' | 'name' | 'organization' | 'type' >;

export interface ImportStatusType {
	dbOperationInProgress: boolean;
	importInProgress: boolean;
}

export type EnvForImport = Pick<
	AppEnvironment,
	'id' | 'appId' | 'name' | 'type' | 'primaryDomain' | 'syncProgress' | 'importStatus' | 'launched'
>;

export function currentUserCanImportForApp( app: App | AppForImport ): boolean {
	// TODO: implement
	return !! app;
}

export const SUPPORTED_DB_FILE_IMPORT_SITE_TYPES = [ 'WordPress' ];

export const isSupportedApp = ( { type }: AppForImport ) =>
	SUPPORTED_DB_FILE_IMPORT_SITE_TYPES.includes( type! );

export const SYNC_STATUS_NOT_SYNCING = 'not_syncing';

export const isImportingBlockedBySync = ( env: EnvForImport ) =>
	env.syncProgress?.status !== SYNC_STATUS_NOT_SYNCING;
