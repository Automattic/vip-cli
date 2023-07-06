// @format

/**
 * External dependencies
 */
import { readFile } from 'node:fs/promises';

/**
 * Internal dependencies
 */
import * as exit from '../lib/cli/exit';

export async function readFromFile( path: string ): Promise< string > {
	try {
		const data = await readFile( path, 'utf-8' );
		return data.trim();
	} catch ( error ) {
		if ( ! ( error instanceof Error ) ) {
			exit.withError( 'Unknown error' );
		}

		if ( 'code' in error && error.code === 'ENOENT' ) {
			exit.withError( `Could not load file "${ path }".` );
		}

		exit.withError( error.message );
	}
}
