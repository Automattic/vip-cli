/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

export interface AppForImport {
	id: Number;
	environments: Array<any>;
	name: string;
	organization: Object;
	type: string;
}

export interface EnvForImport {
	id: Number;
	appId: Number;
	name: string;
	type: string;
	primaryDomain: Object;
	syncProgress: Object;
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
