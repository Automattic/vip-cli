// @format

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { debug } from '../../lib/envvar/logging';
import { readFromFile } from '../read-file';

export function readVariableFromFile( path: string ): Promise< string > {
	debug( `Loading variable value from file "${ path }"` );

	return readFromFile( path );
}
