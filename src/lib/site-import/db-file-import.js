/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

export async function importFile() {}

export function currentUserCanImportForApp( app: any ): boolean {
	// TODO: implement
	return !! app;
}

export function isSupportedApp( app: any ): boolean {
	// TODO: implement
	return !! app;
}

export function permissionCheck( app: any ): void {
	if ( ! currentUserCanImportForApp( app ) ) {
		throw 'The currently authenticated account does not have permission to perform a SQL import.';
	}
}

export function supportedAppCheck( app: any ): void {
	if ( ! isSupportedApp( app ) ) {
		throw 'This application type does not currently support SQL import';
	}
}

export default {
	currentUserCanImportForApp,
	importFile,
	isSupportedApp,
	permissionCheck,
};
