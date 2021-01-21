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

const SQL_DUMP_CREATE_TABLE_IS_MULTISITE_REGEX = /^CREATE TABLE `?(wp_\d_[a-z0-9_]*)/i

export function sqlDumpLineIsMultiSite( line: string ): boolean {
	// determine if we're on a CREATE TABLE statement line what has eg. wp_\d_options
	if ( SQL_DUMP_CREATE_TABLE_IS_MULTISITE_REGEX.test( line ) ) {
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
		await new Promise( resolveBlock =>
			readInterface.on( 'close', resolveBlock )
		);
		resolve( false );
	} );
}
