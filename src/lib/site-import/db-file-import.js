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

export function currentUserCanImportForApp( app ) {
	// TODO: implement
	return !! app;
}

export const SUPPORTED_DB_FILE_IMPORT_SITE_TYPES = [ 'WordPress' ];

export const isSupportedApp = ( { type } ) =>
	SUPPORTED_DB_FILE_IMPORT_SITE_TYPES.includes( type );

export const SYNC_STATUS_NOT_SYNCING = 'not_syncing';

export const isImportingBlockedBySync = ( { syncProgress: { status } } ) =>
	status !== SYNC_STATUS_NOT_SYNCING;
