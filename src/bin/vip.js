#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import args from 'args';
import opn from 'opn';
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import Token from 'lib/token';
import { trackEvent } from 'lib/tracker';

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

const rootCmd = async function() {
	let token = await Token.get();

	const isHelpCommand = process.argv.some( arg => arg === 'help' || arg === '-h' || arg === '--help' );
	const isLogoutCommand = process.argv.some( arg => arg === 'logout' );

	if ( isLogoutCommand || isHelpCommand || ( token && token.valid() ) ) {
		command()
			.command( 'logout', 'Logout from your current session', async () => {
				await Token.purge();
				await trackEvent( 'logout_command_execute' );
				console.log( 'You are successfully logged out.' );
			} )
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'sync', 'Sync production to a development environment' )
			.command( 'wp', 'Run WP CLI commands against an environment' )
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
		console.log( '  VIP CLI is your tool for interacting with and managing your VIP Go applications.' );
		console.log();

		console.log( `  To get started, we need an access token for your VIP account. We'll open ${ tokenURL } in your web browser; follow the instructions there to continue.` );
		console.log();

		await trackEvent( 'login_command_execute' );

		const c = await prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'Ready?',
		} );

		if ( ! c.continue ) {
			await trackEvent( 'login_command_browser_cancelled' );

			return;
		}

		opn( tokenURL, { wait: false } );

		await trackEvent( 'login_command_browser_opened' );

		let t = await prompt( {
			type: 'password',
			name: 'token',
			message: 'Access Token:',
		} );

		t = t.token;

		try {
			token = new Token( t );
		} catch ( e ) {
			console.log( 'The token provided is malformed. Please check the token and try again.' );

			await trackEvent( 'login_command_token_submit_error', { error: e.message } );

			return;
		}

		if ( token.expired() ) {
			console.log( 'The token provided is expired. Please log in again to refresh the token.' );

			await trackEvent( 'login_command_token_submit_error', { error: 'expired' } );

			return;
		}

		if ( ! token.valid() ) {
			console.log( 'The provided token is not valid. Please log in again to refresh the token.' );

			await trackEvent( 'login_command_token_submit_error', { error: 'invalid' } );

			return;
		}

		try {
			Token.set( token.raw );
		} catch ( e ) {
			await trackEvent( 'login_command_token_submit_error', {
				error: e.message,
			} );

			throw e;
		}

		await trackEvent( 'login_command_token_submit_success' );

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
