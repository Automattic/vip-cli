#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

export const NETWORK_SITE_BASE_USAGE = 'vip @mysite.develop network-site';

command( {
	requiredArgs: 2,
} )
	.command( 'launch-status', 'manage the launch status of a network site' )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
