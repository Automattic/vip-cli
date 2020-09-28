/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

export interface AppForImport {
	id: Number;
	name: string;
	type: string;
	organization: Object;
	environments: Array<any>;
	type: string;
}

export function currentUserCanImportForApp( app: AppForImport ): boolean {
	// TODO: implement
	return !! app;
}

export const SUPPORTED_DB_FILE_IMPORT_SITE_TYPES = [ 'WordPress' ];

export const isSupportedApp = ( { type }: AppForImport ) =>
	SUPPORTED_DB_FILE_IMPORT_SITE_TYPES.includes( type );
