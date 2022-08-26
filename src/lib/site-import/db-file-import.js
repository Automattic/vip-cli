/**
 * @flow
 * @format
 */

/**
 * Internal dependencies
 */
import { GB_IN_BYTES } from 'lib/constants/file-size';

export const SQL_IMPORT_FILE_SIZE_LIMIT = 100 * GB_IN_BYTES;
export const SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED = 5 * GB_IN_BYTES;

export interface AppForImport {
	id: number;
	environments: Array<any>;
	name: string;
	organization: Object;
	type: string;
}

export type ImportStatusType = {
	dbOperationInProgress: boolean,
	importInProgress: boolean,
};
export interface EnvForImport {
	id: number;
	appId: number;
	name: string;
	type: string;
	primaryDomain: Object;
	syncProgress: Object;
	importStatus: ImportStatusType;
	launched: boolean;
}

export function currentUserCanImportForApp( app: AppForImport ): boolean {
	// TODO: implement
	return !! app;
}

export const SUPPORTED_DB_FILE_IMPORT_SITE_TYPES = [ 'WordPress' ];

export const isSupportedApp = ( { type }: AppForImport ) =>
	SUPPORTED_DB_FILE_IMPORT_SITE_TYPES.includes( type );

export const SYNC_STATUS_NOT_SYNCING = 'not_syncing';

export const isImportingBlockedBySync = ( { syncProgress: { status } }: EnvForImport ) =>
	status !== SYNC_STATUS_NOT_SYNCING;
