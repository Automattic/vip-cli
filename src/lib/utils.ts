import debugLib from 'debug';
import fs from 'fs';
import { setTimeout } from 'node:timers/promises';
import os from 'os';
import path from 'path';

const debug = debugLib( '@automattic/vip:lib:utils' );

export class PollingTimeoutError extends Error {}

/**
 * Polls a function until its return value satisfies a condition
 */
export async function pollUntil< T >(
	fn: () => Promise< T >,
	interval: number,
	isDone: ( v: T ) => boolean,
	timeoutMs: number = 6 * 60 * 60 * 1000 // Default to 6 hours
) {
	const startTime = Date.now();

	while ( Date.now() - startTime < timeoutMs ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await fn();

		if ( isDone( result ) ) {
			return result;
		}

		// eslint-disable-next-line no-await-in-loop
		await setTimeout( interval );
	}

	throw new PollingTimeoutError( 'Polling timed out' );
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

/**
 * Extract a message from a raw HTTP response body (Apollo's `ServerError.bodyText`).
 *
 * The body may be either `{"status":"error","message":"..."}` (e.g. a 413 whose
 * top-level message is only `Received status code 413`) or a GraphQL
 * `{"errors":[{"message":"..."}]}` payload.
 */
function parseJSONBodyErrorMessage( bodyText: string ): string | null {
	try {
		const body = JSON.parse( bodyText ) as {
			message?: string;
			errors?: { message?: string }[];
		};

		if ( body?.errors?.[ 0 ]?.message ) {
			return body.errors[ 0 ].message;
		}

		if ( body?.message ) {
			return body.message;
		}
	} catch {
		// Body wasn't JSON; nothing to extract.
	}

	return null;
}

interface ApiError {
	bodyText?: string;
	networkError?: { message?: string };
	message?: string;
	graphQLErrors?: { message?: string }[];
}

/**
 * Parse error object and return probable error.
 *
 * Accepts either a known API error shape or an `unknown` value (e.g. a caught
 * error), so callers do not need to cast before passing it in.
 */
export function parseApiError( error: unknown ): string | null {
	const err = error as ApiError;

	if ( err?.networkError?.message ) {
		return err?.networkError?.message;
	}

	if ( err?.graphQLErrors?.[ 0 ]?.message ) {
		return err.graphQLErrors[ 0 ].message;
	}

	// Apollo's `ServerError` exposes the raw HTTP response body as `bodyText`,
	// which often holds a more specific message than the generic top-level one.
	if ( typeof err?.bodyText === 'string' ) {
		const bodyTextMessage = parseJSONBodyErrorMessage( err.bodyText );
		if ( bodyTextMessage ) {
			return bodyTextMessage;
		}
	}

	if ( err?.message ) {
		return err?.message;
	}

	return null;
}

export function splitKeyValueString(
	str: string,
	delimiter = '='
): [ key: string, value: string ] {
	const delimiterIndex = str.indexOf( delimiter );
	if ( delimiterIndex === -1 ) {
		return [ str.trim(), '' ];
	}

	const key = str.slice( 0, delimiterIndex ).trim();
	const value = str.slice( delimiterIndex + delimiter.length ).trim();
	return [ key, value ];
}
