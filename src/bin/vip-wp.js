#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import { stdout } from 'single-line-log';
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';
import readline from 'readline';

/**
 * Internal dependencies
 */
import API, { API_HOST } from 'lib/api';
import commandWrapper from 'lib/cli/command';
import { formatEnvironment } from 'lib/cli/format';
import { confirm } from 'lib/cli/prompt';
import { trackEvent } from 'lib/tracker';
import Token from '../lib/token';

const appQuery = `id, name, environments {
	id
	appId
	type
	name
}`;

const launchCommandOnEnv = async ( appId, envId, command ) => {
	const api = await API();

	return api
		.mutate( {
			// $FlowFixMe: gql template is not supported by flow
			mutation: gql`
				mutation TriggerWPCLICommandMutation($input: AppEnvironmentTriggerWPCLICommandInput ){
					triggerWPCLICommandOnAppEnvironment( input: $input ) {
						inputToken
						command {
							guid
						}
					}
				}
			`,
			variables: {
				input: {
					id: appId,
					environmentId: envId,
					command,
				},
			},
		} );
};

commandWrapper( {
	wildcardCommand: true,
	appContext: true,
	envContext: true,
	appQuery,
} )
	.argv( process.argv, async ( arg, opts ) => {
		const isShellMode = 'shell' === arg[ 0 ];
		const cmd = arg.join( ' ' );

		// Store only the first 2 parts of command to avoid recording secrets. Can be tweaked
		const commandForAnalytics = arg.slice( 0, 2 ).join( ' ' );

		const { id: appId, name: appName } = opts.app;
		const { id: envId, type: envName } = opts.env;

		let result;
		let rl;

		if ( isShellMode ) {
			console.log( `Entering WP-CLI shell mode for ${ formatEnvironment( envName ) } on ${ appName } (${ appId })` );

			if ( 'production' === envName ) {
				console.log( `Remember, this is ${ formatEnvironment( envName ) } - please be careful :)` );
			}

			rl = readline.createInterface( {
				input: process.stdin,
				output: process.stdout,
				terminal: true,
				prompt: 'wp> ',
				// TODO make history persistent across sessions for same env
				historySize: 200,
			} );
		} else if ( 'production' === envName ) {
			const yes = await confirm( [
				{
					key: 'command',
					value: `wp ${ cmd }`,
				},
			], `Are you sure you want to run this command on ${ formatEnvironment( envName ) } for site ${ appName } (${ appId })?` );

			if ( ! yes ) {
				await trackEvent( 'wpcli_confirm_cancel', {
					command: commandForAnalytics,
				} );

				console.log( 'Command canceled' );

				process.exit( 0 );
			}
		}

		try {
			result = await launchCommandOnEnv( appId, envId, cmd );
		} catch ( e ) {
			console.log( e );

			return;
		}

		const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

		await trackEvent( 'wpcli_command_execute', {
			command: commandForAnalytics,
			guid: cliCommand.guid,
		} );

		const token = await Token.get();
		const socket = SocketIO( `${ API_HOST }/wp-cli`, {
			transportOptions: {
				polling: {
					extraHeaders: {
						Authorization: `Bearer ${ token.raw }`,
					},
				},
			},
		} );

		const stdoutStream = IOStream.createStream();
		const stdinStream = IOStream.createStream();

		// TODO handle all arguments
		// TODO handle disconnect - does IOStream correctly buffer stdin?
		// TODO stderr - currently server doesn't support it, so errors don't terminate process

		const data = {
			guid: cliCommand.guid,
			inputToken,
			columns: process.stdout.columns,
			rows: process.stdout.rows,
		};

		IOStream( socket ).emit( 'cmd', data, stdinStream, stdoutStream );

		if ( isShellMode ) {
			rl.on( 'line', line => {
				stdinStream.write( line + '\n' );
			} );

			rl.on( 'SIGINT', () => {
				rl.question( 'Are you sure you want to exit? ', answer => {
					if ( answer.match( /^y(es)?$/i ) ) {
						stdinStream.write( 'exit();\n' );
					} else {
						rl.prompt();
					}
				} );
			} );
		}

		stdoutStream.pipe( process.stdout );

		stdoutStream.on( 'error', err => {
			// TODO handle this better
			console.log( err );

			process.exit( 1 );
		} );

		stdoutStream.on( 'end', () => {
			process.exit();
		} );

		socket.on( 'unauthorized', err => {
			console.log( 'There was an error with the authentication:', err.message );
		} );

		socket.on( 'error', err => {
			console.log( err );
		} );
	} );
