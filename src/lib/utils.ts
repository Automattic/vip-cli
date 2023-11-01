import debugLib from 'debug';
import fs from 'fs';
import { setTimeout } from 'node:timers/promises';
import os from 'os';
import path from 'path';

const debug = debugLib( '@automattic/vip:lib:utils' );

/**
 * Polls a function until its return value satisfies a condition
 *
 * @param {Function} fn       A function to poll
 * @param {number}   interval Poll interval in milliseconds
 * @param {Function} isDone   A function that accepts the return of `fn`. Stops the polling if it returns true
 * @return {Promise}          A promise which resolves when the polling is done
 * @throws {Error}            If the fn throws an error
 */
export async function pollUntil< T >(
	fn: () => Promise< T >,
	interval: number,
	isDone: ( v: T ) => boolean
): Promise< void > {
	let done = false;
	while ( ! done ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await fn();
		done = isDone( result );
		if ( ! done ) {
			// eslint-disable-next-line no-await-in-loop
			await setTimeout( interval );
		}
	}
}

/**
 * Create a temporary directory in the system's temp directory
 *
 * @param {string} prefix Prefix for the directory name
 * @return {string}       Path to the temporary directory
 * @throws {Error}        If the directory cannot be created
 */
export function makeTempDir( prefix = 'vip-cli' ): string {
	const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), `${ prefix }-` ) );
	debug( `Created a directory to hold temporary files: ${ tempDir }` );

	process.on( 'exit', () => {
		try {
			fs.rmSync( tempDir, { recursive: true, force: true, maxRetries: 10 } );
			debug( `Removed temporary directory: ${ tempDir }` );
		} catch ( err ) {
			console.warn(
				`Failed to remove temporary directory ${ tempDir } (${ ( err as Error ).message })`
			);
		}
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
export function getAbsolutePath( filePath: string ): string {
	if ( filePath.startsWith( '~' ) ) {
		return filePath.replace( '~', os.homedir() );
	}

	if ( ! path.isAbsolute( filePath ) ) {
		return path.resolve( process.cwd(), filePath );
	}

	return filePath;
}
