#!/usr/bin/env node

/**
 * External dependencies
 */
import opn from 'opn';
import { prompt } from 'enquirer';
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import config from '../lib/cli/config';
import command, { containsAppEnvArgument } from '../lib/cli/command';
import Token from '../lib/token';
import { trackEvent, aliasUser } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:vip' );

if ( config && config.environment !== 'production' ) {
	debug( `${ chalk.bgYellow( 'WARNING:' ) } RUNNING DEV VERSION OF @automattic/vip` );
	debug(
		'You should `npm link` your locally checked out copy of this repo as part of your development setup.'
	);
}

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

const runCmd = async function () {
	const cmd = command();
	cmd
		.command( 'logout', 'Logout from your current session' )
		.command( 'app', 'List and modify your VIP applications' )
		.command( 'backup', 'Generate a backup for VIP applications' )
		.command( 'cache', 'Manage page cache for your VIP applications' )
		.command( 'config', 'Set configuration for your VIP applications' )
		.command( 'dev-env', 'Use local dev-environment' )
		.command( 'export', 'Export data from your VIP application' )
		.command( 'import', 'Import media or SQL files into your VIP applications' )
		.command( 'logs', 'Get logs from your VIP applications' )
		.command( 'search-replace', 'Perform search and replace tasks on files' )
		.command( 'slowlogs', 'Get slowlogs from your VIP applications' )
		.command( 'sync', 'Sync production to a development environment' )
		.command( 'whoami', 'Display details about the currently logged-in user' )
		.command( 'validate', 'Validate your VIP application and environment' )
		.command( 'wp', 'Run WP CLI commands against an environment' );

	cmd.argv( process.argv );
};

/**
 * @param {any[]} argv
 * @param {any[]} params
 * @returns {boolean}
 */
function doesArgvHaveAtLeastOneParam( argv, params ) {
	return argv.some( arg => params.includes( arg ) );
}

const rootCmd = async function () {
	let token = await Token.get();

	const isHelpCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'help', '-h', '--help' ] );
	const isVersionCommand = doesArgvHaveAtLeastOneParam( process.argv, [ '-v', '--version' ] );
	const isLogoutCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'logout' ] );
	const isLoginCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'login' ] );
	const isDevEnvCommandWithoutEnv =
		doesArgvHaveAtLeastOneParam( process.argv, [ 'dev-env' ] ) &&
		! containsAppEnvArgument( process.argv );

	debug( 'Argv:', process.argv );

	if (
		! isLoginCommand &&
		( isLogoutCommand ||
			isHelpCommand ||
			isVersionCommand ||
			isDevEnvCommandWithoutEnv ||
			token?.valid() )
	) {
		await runCmd();
	} else {
		console.log();
		console.log( '   _    __ ________         ________    ____' );
		console.log( '  | |  / //  _/ __        / ____/ /   /  _/' );
		console.log( '  | | / / / // /_/ /______/ /   / /    / /  ' );
		console.log( '  | |/ /_/ // ____//_____/ /___/ /____/ /   ' );
		console.log( '  |___//___/_/           ____/_____/___/   ' );
		console.log();
		console.log(
			'  VIP-CLI is your tool for interacting with and managing your VIP applications.'
		);
		console.log();

		console.log(
			'  Authenticate your installation of VIP-CLI with your Personal Access Token. This URL will be opened in your web browser automatically so that you can retrieve your token: ' +
				tokenURL
		);
		console.log();

		await trackEvent( 'login_command_execute' );

		const answer = await prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'Ready to authenticate?',
		} );

		if ( ! answer.continue ) {
			await trackEvent( 'login_command_browser_cancelled' );

			return;
		}

		opn( tokenURL, { wait: false } );

		await trackEvent( 'login_command_browser_opened' );

		const { token: tokenInput } = await prompt( {
			type: 'password',
			name: 'token',
			message: 'Access Token:',
		} );

		try {
			token = new Token( tokenInput );
		} catch ( err ) {
			console.log( 'The token provided is malformed. Please check the token and try again.' );

			await trackEvent( 'login_command_token_submit_error', { error: err.message } );

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
			await Token.set( token.raw );
		} catch ( err ) {
			await trackEvent( 'login_command_token_submit_error', {
				error: err.message,
			} );

			throw err;
		}

		// De-anonymize user for tracking
		await aliasUser( token.id );

		await trackEvent( 'login_command_token_submit_success' );

		if ( isLoginCommand ) {
			console.log( 'You are now logged in - see `vip -h` for a list of available commands.' );

			process.exit();
		}

		await runCmd();
	}
};

// We may end up having an unhandled rejection here :-(
void rootCmd();
