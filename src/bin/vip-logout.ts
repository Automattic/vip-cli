#!/usr/bin/env node

import command from '../lib/cli/command';
import logout from '../lib/logout';

void command( { usage: 'vip logout' } )
	.examples( [
		{
			usage: 'vip logout',
			description: 'Log out the current authenticated VIP-CLI user.',
		},
	] )
	.argv( process.argv, async () => {
		await logout();

		console.log( 'You are successfully logged out.' );
	} );
