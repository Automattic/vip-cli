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
		const { spawn } = require('child_process');

		// run login first
		// can not run the login command here as they are defined only if user is logged in
		const loginSpawn = spawn( process.argv[ 0 ], [ 'dist/bin/vip-login.js' ], { stdio: 'inherit' } );

		loginSpawn.on( 'exit', async ( code, signal ) => {
			let token = await Token.get();

			if ( token && token.valid() ) {
				// user is logged in now, run desired command:
				return spawn( process.argv[ 0 ], process.argv.slice( 1 ), { stdio: 'inherit' } );
			}

			return;
		} );
	}
};

rootCmd();
