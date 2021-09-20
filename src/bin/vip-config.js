#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 2,
} )
	.command( 'envvar', 'Manage environment variables for an application environment' )
	.argv( process.argv, async ( arg, opts ) => {
		console.log( 'hello from here' );
		process.exit( 0 );
	} );
