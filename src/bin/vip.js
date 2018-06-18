#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import args from 'args';
import opn from 'opn';
import inquirer from 'inquirer';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import Token from 'lib/token';
import { trackEvent } from 'lib/analytics';

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

const rootCmd = async function() {
	let token = await Token.get();

	if ( token && token.valid() ) {
		command()
			.command( 'logout', 'Logout from your current session', () => {
				Token.purge();

				await trackEvent( 'logout' );
			} )
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'sync', 'Sync production to a development environment' )
			.argv( process.argv );
	} else {
		// Bypass helper function
		args.parse( process.argv );

		console.log();
		console.log( '  Welcome to' );
		console.log( '   _    __________     ______' );
		console.log( '  | |  / /  _/ __ \\   / ____/___' );
		console.log( '  | | / // // /_/ /  / / __/ __ \\' );
		console.log( '  | |/ // // ____/  / /_/ / /_/ /' );
		console.log( '  |___/___/_/       \\____/\\____/' );
		console.log();
		console.log( `  First you need an access token. We'll open ${ tokenURL } in your web browser. Follow the instructions there to continue.` );
		console.log();

		await trackEvent( 'login' );

		const c = await inquirer.prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'Continue?',
			prefix: '',
		} );

		if ( ! c.continue ) {
			await trackEvent( 'login_browser_open_cancel' );

			return;
		}

		opn( tokenURL, { wait: false } );

		await trackEvent( 'login_browser_open_success' );

		let t = await inquirer.prompt( {
			type: 'password',
			name: 'token',
			message: 'Access Token:',
			prefix: '',
		} );

		t = t.token;

		try {
			token = new Token( t );
		} catch ( e ) {
			console.log( 'The token provided is malformed. Please check the token and try again.' );

			await trackEvent( 'login_token_submit_error', { error: e.message, } );

			return;
		}

		if ( token.expired() ) {
			console.log( 'The token provided is expired. Please log in again to refresh the token.' );

			await trackEvent( 'login_token_submit_error', { error: 'expired', } );

			return;
		}

		if ( ! token.valid() ) {
			console.log( 'The provided token is not valid. Please log in again to refresh the token.' );

			await trackEvent( 'login_token_submit_error', { error: 'invalid', } );

			return;
		}

		Token.set( token.raw );

		await trackEvent( 'login_token_submit_success' );

		// Exec the command we originally  wanted
		const spawn = require( 'child_process' ).spawn;
		const bin = process.argv[ 1 ];
		const argv = process.argv.slice( 2 );
		spawn( bin, argv, { stdio: 'inherit' } );
	}
};

rootCmd();
