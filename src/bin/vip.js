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

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

const rootCmd = async function() {
	let token = await Token.get();

	if ( token && token.valid() ) {
		command()
			.command( 'logout', 'Logout from your current session', () => Token.purge() )
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'sync', 'Sync production to a development environment' )
			.argv( process.argv );
	} else {
		// Bypass helper function
		args.parse( process.argv );

		const c = await inquirer.prompt( {
			type: 'confirm',
			name: 'continue',
			message: `This will open ${ tokenURL } in your web browser. Follow the instructions there to acquire an access token. Continue?`,
			prefix: '',
		} );

		if ( ! c.continue ) {
			return;
		}

		opn( tokenURL, { wait: false } );

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
			return;
		}

		if ( token.expired() ) {
			console.log( 'The token provided is expired. Please log in again to refresh the token.' );
			return;
		}

		if ( ! token.valid() ) {
			console.log( 'The provided token is not valid. Please log in again to refresh the token.' );
			return;
		}

		Token.set( token.raw );

		// Exec the command we originally  wanted
		const spawn = require( 'child_process' ).spawn;
		const bin = process.argv[ 1 ];
		const argv = process.argv.slice( 2 );
		spawn( bin, argv, { stdio: 'inherit' } );
	}
};

rootCmd();
