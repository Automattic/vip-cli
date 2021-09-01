#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import args from 'args';
import opn from 'opn';
import { prompt } from 'enquirer';
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import config from 'root/config/config.json';
import command from 'lib/cli/command';
import Token from 'lib/token';
import { trackEvent, aliasUser } from 'lib/tracker';
import { rollbar } from 'lib/rollbar';

const debug = debugLib( '@automattic/vip:bin:vip' );

if ( config && config.environment !== 'production' ) {
	debug( `${ chalk.bgYellow( 'WARNING:' ) } RUNNING DEV VERSION OF @automattic/vip` );
	debug( 'You should `npm link` your locally checked out copy of this repo as part of your development setup.' );
}

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

const runCmd = function() {
	const cmd = command();
	cmd
		.command( 'logout', 'Logout from your current session', async () => {
			await Token.purge();
			await trackEvent( 'logout_command_execute' );
			console.log( 'You are successfully logged out.' );
		} )
		.command( 'app', 'List and modify your VIP applications' )
		.command( 'config', 'Set configuration for your VIP applications' )
		.command( 'dev-env', 'Use local dev-environment' )
		.command( 'import', 'Import media or SQL files into your VIP applications' )
		.command( 'search-replace', 'Perform search and replace tasks on files' )
		.command( 'sync', 'Sync production to a development environment' )
		.command( 'wp', 'Run WP CLI commands against an environment' )
		.argv( process.argv );
};

const rootCmd = async function() {
	let token = await Token.get();

	const isHelpCommand = process.argv.some( arg => arg === 'help' || arg === '-h' || arg === '--help' );
	const isLogoutCommand = process.argv.some( arg => arg === 'logout' );

	debug( 'Argv:', process.argv );

	if ( isLogoutCommand || isHelpCommand || ( token && token.valid() ) ) {
		runCmd();
	} else {
		console.log();
		console.log( '  Welcome to' );
		console.log( '   _    __ ________         ________    ____' );
		console.log( '  | |  / //  _/ __ \       / ____/ /   /  _/' );
		console.log( '  | | / / / // /_/ /______/ /   / /    / /  ' );
		console.log( '  | |/ /_/ // ____//_____/ /___/ /____/ /   ' );
		console.log( '  |___//___/_/           \____/_____/___/   ' );
		console.log();
		console.log( '  VIP CLI is your tool for interacting with and managing your VIP applications.' );
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

			rollbar.error( e );
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

			rollbar.error( e );
			throw e;
		}

		// De-anonymize user for tracking
		await aliasUser( token.id );

		await trackEvent( 'login_command_token_submit_success' );

		runCmd();
	}
};

rootCmd();
