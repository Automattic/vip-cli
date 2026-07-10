#!/usr/bin/env node

import '../lib/node-version-check';

import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';

import command, { containsAppEnvArgument } from '../lib/cli/command';
import config from '../lib/cli/config';
import * as exit from '../lib/cli/exit';
import { loadInternalBin } from '../lib/cli/internal-bin-loader';
import {
	rewriteArgvForInternalBin,
	resolveInternalBinFromArgv,
	isSeaRuntime,
} from '../lib/cli/sea-dispatch';
import { doesArgvHaveAtLeastOneParam, isTokenReadRequired } from '../lib/cli/startup-args';
import tokenCache from '../lib/rechallenge/token-cache';
import Token from '../lib/token';
import { aliasUser, trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:vip' );

if ( config && config.environment !== 'production' ) {
	debug( `${ chalk.bgYellow( 'WARNING:' ) } RUNNING DEV VERSION OF @automattic/vip` );
	debug(
		'You should `npm link` your locally checked out copy of this repo as part of your development setup.'
	);
}

// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';
const customDeployToken = process.env.WPVIP_DEPLOY_TOKEN;

async function maybeExecuteSeaTargetCommand() {
	const targetBin = process.env.VIP_CLI_TARGET_BIN;
	if ( ! isSeaRuntime() || ! targetBin || targetBin === 'vip' ) {
		return false;
	}

	const start = Number( process.env.VIP_CLI_TARGET_START ?? '0' );
	const length = Number( process.env.VIP_CLI_TARGET_LENGTH ?? '0' );
	const resolution = {
		start: Number.isInteger( start ) ? start : 0,
		length: Number.isInteger( length ) ? length : 0,
	};

	process.argv = rewriteArgvForInternalBin( process.argv, resolution );
	const loaded = await loadInternalBin( targetBin );
	if ( ! loaded ) {
		throw new Error( `Unable to load SEA command target "${ targetBin }"` );
	}

	return true;
}

const runCmd = async function () {
	const cmd = command();
	cmd
		.command( 'logout', 'Log out the current authenticated VIP-CLI user.' )
		.command(
			'app',
			'Interact with applications that the current authenticated VIP-CLI user has permission to access.'
		)
		.command( 'backup', 'Generate a backup of an environment.' )
		.command( 'cache', 'Manage page cache for an environment.' )
		.command( 'config', 'Manage environment configurations.' )
		.command( 'dev-env', 'Create and manage VIP Local Development Environments.' )
		.command( 'export', 'Export a copy of data associated with an environment.' )
		.command( 'import', 'Import media or SQL database files to an environment.' )
		.command( 'logs', 'Retrieve Runtime Logs from an environment.' )
		.command(
			'search-replace',
			'Search for a string in a local SQL file and replace it with a new string.'
		)
		.command( 'slowlogs', 'Retrieve MySQL slow query logs from an environment.' )
		.command( 'db', "Access an environment's database." )
		.command( 'defensive-mode', 'Manage VIP defensive mode for an environment.' )
		.command( 'sync', 'Sync the database from production to a non-production environment.' )
		.command( 'whoami', 'Retrieve details about the current authenticated VIP-CLI user.' )
		.command( 'wp', 'Execute a WP-CLI command against an environment.' );

	await cmd.argv( process.argv );
};

async function runLoginFlow() {
	console.log();
	console.log( '   _    __ ________         ________    ____' );
	console.log( '  | |  / //  _/ __        / ____/ /   /  _/' );
	console.log( '  | | / / / // /_/ /______/ /   / /    / /  ' );
	console.log( '  | |/ /_/ // ____//_____/ /___/ /____/ /   ' );
	console.log( '  |___//___/_/           ____/_____/___/   ' );
	console.log();
	console.log( '  VIP-CLI is your tool for interacting with and managing your VIP applications.' );
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

		return null;
	}

	const { default: open } = await import( 'open' );

	open( tokenURL, { wait: false } );

	await trackEvent( 'login_command_browser_opened' );

	const { token: tokenInput } = await prompt( {
		type: 'password',
		name: 'token',
		message: 'Access Token:',
	} );

	let token;
	try {
		token = new Token( tokenInput );
	} catch ( err ) {
		console.log( 'The token provided is malformed. Please check the token and try again.' );

		await trackEvent( 'login_command_token_submit_error', { error: err.message } );

		return null;
	}

	if ( token.expired() ) {
		console.log( 'The token provided is expired. Please log in again to refresh the token.' );

		await trackEvent( 'login_command_token_submit_error', { error: 'expired' } );

		return null;
	}

	if ( ! token.valid() ) {
		console.log( 'The provided token is not valid. Please log in again to refresh the token.' );

		await trackEvent( 'login_command_token_submit_error', { error: 'invalid' } );

		return null;
	}

	try {
		await Token.set( token.raw );
	} catch ( err ) {
		await trackEvent( 'login_command_token_submit_error', {
			error: err.message,
		} );

		throw err;
	}

	// Elevated tokens are keyed by API host + scope, not by user identity. Drop any
	// cached elevation from a previous login so it cannot carry across identities.
	await tokenCache.clearAll();

	// De-anonymize user for tracking
	await aliasUser( token.id );

	await trackEvent( 'login_command_token_submit_success' );

	return token;
}

/**
 * Reads the stored auth token, but only for commands whose branch decision
 * actually depends on it.
 *
 * Commands like `vip -h` / `vip -v` / `logout` never consult the token, so we
 * skip the keychain entirely for them. This matters over SSH / non-graphical
 * sessions where the OS keychain may be locked or unable to show an
 * authorization prompt: reading the stored credential there throws a bare
 * native error that would otherwise crash the CLI before argument parsing.
 *
 * @param {Object} flags Precomputed argv classification flags.
 * @returns {Promise<Token | undefined>} The stored token, or undefined when not needed.
 */
async function resolveToken( flags ) {
	if ( ! isTokenReadRequired( flags ) ) {
		return undefined;
	}

	try {
		return await Token.get();
	} catch ( err ) {
		debug( 'Failed to read token from keychain:', err );

		exit.withError(
			'Unable to read VIP-CLI credentials from the system keychain: ' +
				`${ err instanceof Error ? err.message : String( err ) }\n` +
				'If you are connected over SSH or a non-graphical session, the OS keychain may be ' +
				'locked or unable to show an authorization prompt. Try running VIP-CLI from a local, ' +
				'graphical session, or unlock the keychain first.\n' +
				'Re-run with the environment variable DEBUG=@automattic/vip:* for full details.'
		);
	}
}

const rootCmd = async function () {
	if ( isSeaRuntime() && ! process.env.VIP_CLI_TARGET_BIN ) {
		const resolution = resolveInternalBinFromArgv( process.argv );
		if ( resolution.bin !== 'vip' ) {
			process.env.VIP_CLI_TARGET_BIN = resolution.bin;
			process.env.VIP_CLI_TARGET_START = String( resolution.start );
			process.env.VIP_CLI_TARGET_LENGTH = String( resolution.length );
		}
	}

	const isHelpCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'help', '-h', '--help' ] );
	const isVersionCommand = doesArgvHaveAtLeastOneParam( process.argv, [ '-v', '--version' ] );
	const isLogoutCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'logout' ] );
	const isLoginCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'login' ] );
	const isDevEnvCommandWithoutEnv =
		doesArgvHaveAtLeastOneParam( process.argv, [ 'dev-env' ] ) &&
		! containsAppEnvArgument( process.argv );
	const isCustomDeployCmdWithKey =
		doesArgvHaveAtLeastOneParam( process.argv, [ 'deploy' ] ) && Boolean( customDeployToken );

	debug( 'Argv:', process.argv );

	let token = await resolveToken( {
		isLoginCommand,
		isLogoutCommand,
		isHelpCommand,
		isVersionCommand,
		isDevEnvCommandWithoutEnv,
		isCustomDeployCmdWithKey,
	} );

	if (
		! isLoginCommand &&
		( isLogoutCommand ||
			isHelpCommand ||
			isVersionCommand ||
			isDevEnvCommandWithoutEnv ||
			token?.valid() ||
			isCustomDeployCmdWithKey )
	) {
		if ( await maybeExecuteSeaTargetCommand() ) {
			return;
		}
		await runCmd();
	} else {
		token = await runLoginFlow();
		if ( ! token ) {
			return;
		}

		if ( isLoginCommand ) {
			console.log( 'You are now logged in - see `vip -h` for a list of available commands.' );

			process.exit();
		}

		if ( await maybeExecuteSeaTargetCommand() ) {
			return;
		}

		await runCmd();
	}
};

// We may end up having an unhandled rejection here :-(
void rootCmd();
