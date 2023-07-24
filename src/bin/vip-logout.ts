#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import logout from '../lib/logout';

void command( { usage: 'vip logout' } )
	.examples( [
		{
			usage: 'vip logout',
			description: 'Logs out current user.',
		},
	] )
	.argv( process.argv, async () => {
		await logout();

		console.log( 'You are successfully logged out.' );
	} );
