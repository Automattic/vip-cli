// @format

/**
 * External dependencies
 */
import { red, yellow } from 'chalk';

/**
 * Internal dependencies
 */
import env from '../../lib/env';

export function withError( message: Error | string ): never {
	console.error( `${ red( 'Error: ' ) } ${ message.toString().replace( /^Error:\s*/, '' ) }` );

	// Debug ouput is printed below error output both for information
	// hierarchy and to make it more likely that the user copies it to their
	// clipboard when dragging across output.
	console.log(
		`${ yellow( 'Debug: ' ) } VIP-CLI v${ env.app.version }, Node ${ env.node.version }, ${
			env.os.name
		} ${ env.os.version }`
	);

	process.exit( 1 );
}
