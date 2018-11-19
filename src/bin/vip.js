#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import args from 'args';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import Token from 'lib/token';
import { trackEvent } from 'lib/tracker';

// By default, we'll log the user if he's logged out
// Define commands to ignore from this behavior
const IGNORE_LOGIN = [
	'logout',
];

// Config
const rootCmd = async function() {
	let token = await Token.get();

	if ( token && token.valid() ) {
		command()
			.command( 'logout', 'Logout from your current session', async () => {
				await Token.purge();
				await trackEvent( 'logout_command_execute' );
			} )
			.command( 'login', 'Login to the vip cli' )
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'sync', 'Sync production to a development environment' )
			.argv( process.argv );
	} else {
		// parse arguments in case it's a general subcommand (help, version...)
		args.parse( process.argv );

		const currentCommand = process.argv[ 2 ];

		if ( IGNORE_LOGIN.includes( currentCommand ) ) {
			return;
		}

		const { spawn } = require('child_process');

		// run login first
		// can not run the login command here as they are defined only if user is logged in
		const loginSpawn = spawn( process.argv[ 0 ], [ 'dist/bin/vip-login.js' ], { stdio: 'inherit' } );

		loginSpawn.on( 'exit', async ( code, signal ) => {
			let token = await Token.get();

			if ( token && token.valid() && ! 'login' === currentCommand ) {
				// user is logged in now, run desired command:
				return spawn( process.argv[ 0 ], process.argv.slice( 1 ), { stdio: 'inherit' } );
			}

			return;
		} );
	}
};

rootCmd();
