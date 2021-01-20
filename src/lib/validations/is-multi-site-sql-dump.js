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
import { getReadInterface } from 'lib/validations/sql';
import * as exit from 'lib/cli/exit';

export function isMultiSiteDumpFile( fileName: string ): Promise<boolean> {
	return new Promise( async resolve => {
		const readInterface = await getReadInterface( fileName );
		readInterface.on( 'line', line => {
			const multiSiteTableNameRegex = /^CREATE TABLE `?(wp_\d_[a-z0-9_]*)/i;
			// determine if we're on a CREATE TABLE statement line what has eg. wp_\d_options
			if ( multiSiteTableNameRegex.test( line ) ) {
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
