#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import opn from 'opn';
import inquirer from 'inquirer';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import Token from 'lib/token';

command( { format: true } )
	.argv( process.argv, async ( arg, options ) => {
		let token = await Token.get();

		// double check if user is already logged in
		if ( token && token.valid() ) {
			return console.log( 'You are already logged in' );
		}

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

		const c = await inquirer.prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'Ready?',
			prefix: '',
		} );

		if ( ! c.continue ) {
			await trackEvent( 'login_command_browser_cancelled' );

			return;
		}

		opn( tokenURL, { wait: false } );

		await trackEvent( 'login_command_browser_opened' );

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

	} );
