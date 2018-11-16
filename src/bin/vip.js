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
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'login', 'Login to the vip cli' )
			.command( 'sync', 'Sync production to a development environment' )
			.argv( process.argv );
	} else {
		// Bypass helper function
		args.parse( process.argv );

		// Exec the command we originally  wanted
		const argv = process.argv.slice( 2 );
		if ( argv.length ) {
			return args.runCommand( { usage: process.argv.slice( 2 ) } );
		}

		const { spawn } = require( 'child_process' );
		spawn( process.argv[ 0 ], process.argv.slice( 1 ), { stdio: 'inherit' } );
	}
};

rootCmd();
