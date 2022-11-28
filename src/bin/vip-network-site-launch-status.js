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
	requiredArgs: 1,
} )
	.command( 'get', 'get the launch status of a network site' )
	.command( 'set', 'set the launch status of a network site' )
	.command( 'unset', 'unset the launch status of a network site' )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
