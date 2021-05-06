/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { getReadInterface } from 'lib/validations/line-by-line';
import * as exit from 'lib/cli/exit';

const SQL_DUMP_CREATE_TABLE_IS_MULTISITE_REGEX = /^CREATE TABLE `?(wp_\d+_[a-z0-9_]*|wp_blogs)/i;
const SQL_DUMP_CONTAINS_MULTISITE_WP_USERS_REGEX = /\`spam\` tinyint\(2\)|\`deleted\` tinyint\(2\)/i;

export function sqlDumpLineIsMultiSite( line: string ): boolean {
	// determine if we're on a CREATE TABLE statement line what has eg. wp_\d_options OR wp_blogs
	// also check if we're on a line that defines the additional two columns found on the wp_users table for multisites
	if (
		SQL_DUMP_CREATE_TABLE_IS_MULTISITE_REGEX.test( line ) ||
		SQL_DUMP_CONTAINS_MULTISITE_WP_USERS_REGEX.test( line )
	) {
		return true;
	}
	return false;
}

export function isMultiSiteDumpFile( fileName: string ): Promise<boolean> {
	return new Promise( async resolve => {
		const readInterface = await getReadInterface( fileName );
		readInterface.on( 'line', line => {
			const result = sqlDumpLineIsMultiSite( line );
			if ( true === result ) {
				resolve( true );
			}
		} );

		readInterface.on( 'error', () => {
			exit.withError(
				'An error was encountered while reading your SQL dump file.  Please verify the file contents.'
			);
		} );
		// Block until the processing completes
		await new Promise( resolveBlock => readInterface.on( 'close', resolveBlock ) );
		resolve( false );
	} );
}
