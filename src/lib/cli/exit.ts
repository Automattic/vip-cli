import chalk from 'chalk';
import debug from 'debug';

import env from '../../lib/env';

export function withError( message: Error | string ): never {
	const msg = message instanceof Error ? message.message : message;
	console.error( `${ chalk.red( 'Error: ' ) } ${ msg.replace( /^Error:\s*/, '' ) }` );

	// Debug ouput is printed below error output both for information
	// hierarchy and to make it more likely that the user copies it to their
	// clipboard when dragging across output.
	console.log(
		`${ chalk.yellow( 'Debug: ' ) } VIP-CLI v${ env.app.version }, Node ${ env.node.version }, ${
			env.os.name
		} ${ env.os.version } ${ env.os.arch }`
	);

	if ( debug.names.length > 0 && message instanceof Error ) {
		console.error( chalk.yellow( 'Debug: ' ), message );
	}

	process.exit( 1 );
}
