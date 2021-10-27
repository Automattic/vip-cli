/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import { promises as fs } from 'fs';

/**
 * Internal dependencies
 */
import * as exit from 'lib/cli/exit';
import { debug } from 'lib/envvar/logging';

export async function readVariableFromFile( path ): Promise<string> {
	debug( `Loading variable value from file ${ JSON.stringify( path ) }` );

	const data = await fs.readFile( path, 'binary' )
		.catch( ( { message } ) => {
			// Provide friendly version of common error.
			if ( message.startsWith( 'ENOENT: no such file or directory' ) ) {
				exit.withError( `Could not load file ${ JSON.stringify( path ) }.` );
			}

			exit.withError( message );
		} );
	return Buffer.from( data ).toString().trim();
}
