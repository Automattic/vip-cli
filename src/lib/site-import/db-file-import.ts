/**
 * Internal dependencies
 */
import { App, AppEnvironment } from '../../graphqlTypes';
import { GB_IN_BYTES } from '../../lib/constants/file-size';
import { DATABASE_APPLICATION_TYPE_IDS } from '../../lib/constants/vipgo';

export const SQL_IMPORT_FILE_SIZE_LIMIT = 100 * GB_IN_BYTES;
export const SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED = 5 * GB_IN_BYTES;

export type AppForImport = Pick< App, 'id' | 'environments' | 'name' | 'organization' | 'typeId' >;

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

export const isSupportedApp = ( { typeId }: AppForImport ) =>
	DATABASE_APPLICATION_TYPE_IDS.includes( typeId as number );

export const SYNC_STATUS_NOT_SYNCING = 'not_syncing';

export const isImportingBlockedBySync = ( env: EnvForImport ) =>
	env.syncProgress?.status !== SYNC_STATUS_NOT_SYNCING;
