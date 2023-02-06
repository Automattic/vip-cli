#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

command( {
	requiredArgs: 2,
} )
	.command( 'envvar', 'Manage environment variables for an application environment' )
	.command( 'notifications', 'Configure notification streams for an application environment' )
	.command( 'software', 'Software management' )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
