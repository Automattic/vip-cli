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
	.command( 'launch-status', 'manage the launch status of a network site' )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
