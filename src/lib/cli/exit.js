/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */

export function withError( message: string ) {
	let updatedMessage = message;

	console.log( message.toString().replace( /^(Error: )*/, chalk.red( 'Error: ' ) ) );
	process.exit( 1 );
}
