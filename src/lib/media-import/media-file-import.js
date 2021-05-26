/**
 * @flow
 * @format
 */

/**
 * Internal dependencies
 */
import { GB_IN_BYTES } from 'lib/constants/file-size';

export const MEDIA_IMPORT_FILE_SIZE_LIMIT = 30 * GB_IN_BYTES;

export interface AppForMediaImport {
	id: Number;
	environments: Array<any>;
	name: string;
	organization: Object;
	type: string;
}

export function currentUserCanImportForApp( app: AppForMediaImport ): boolean {
	// TODO: implement
	return !! app;
}

export const SUPPORTED_MEDIA_FILE_IMPORT_SITE_TYPES = [ 'WordPress' ];

export const isSupportedApp = ( { type }: AppForMediaImport ) =>
	SUPPORTED_MEDIA_FILE_IMPORT_SITE_TYPES.includes( type );
