/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import debugLib from 'debug';

/**
 * Internal dependencies
 */

const debug = debugLib( '@automattic/vip:lib:utils' );

/**
 * Polls a function until its return value satisfies a condition
 *
 * @param {Function} fn       A function to poll
 * @param {number}   interval Poll interval in milliseconds
 * @param {Function} isDone   A function that accepts the return of `fn`. Stops the polling if it returns true
 * @return {Promise} 					A promise which resolves when the polling is done
 * @throws {Error} 						If the fn throws an error
 */
export async function pollUntil( fn, interval, isDone ) {
	// eslint-disable-next-line no-constant-condition
	while ( true ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await fn();
		if ( isDone( result ) ) {
			return;
		}

		// eslint-disable-next-line no-await-in-loop
		await new Promise( res => setTimeout( res, interval ) );
	}
}

/**
 * Create a temporary directory in the system's temp directory
 *
 * @param {string} prefix Prefix for the directory name
 * @return {string}				Path to the temporary directory
 * @throws {Error} 				If the directory cannot be created
 */
export function makeTempDir( prefix = 'vip-cli' ) {
	const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), `${ prefix }-` ) );
	debug( `Created a directory to hold temporary files: ${ tempDir }` );

	process.on( 'exit', () => {
		fs.rmSync( tempDir, { recursive: true, force: true } );
		debug( `Removed temporary directory: ${ tempDir }` );
	} );

	return tempDir;
}

/**
 * Get absolute path to a file
 * 
 * @param {string} filePath Path to the file
 * 
 * @return {string} Absolute path to the file
 */
export function getAbsolutePath( filePath ) {
	if ( filePath.startsWith( '/' ) ) {
		return filePath;
	}

	if ( filePath.startsWith( '~') ) {
		return filePath.replace( '~', os.homedir() );
	}

	return path.join( process.cwd(), filePath );
}
