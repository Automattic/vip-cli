/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { debug } from 'lib/envvar/logging';
import { readFromFile } from '../read-file';

export async function readVariableFromFile( path ) {
	debug( `Loading variable value from file ${ JSON.stringify( path ) }` );

	return await readFromFile( path );
}
