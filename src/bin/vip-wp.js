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
import app from 'lib/api/app';
import command from 'lib/cli/command';
import { formatEnvironment } from 'lib/cli/format';
import { trackEvent } from 'lib/tracker';
import Token from '../lib/token';

const appQuery = `id, name, environments {
	id
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
					command: command,
				},
			},
		} );
}

command( {
	wildcardCommand: true,
	appContext: true,
	envContext: true,
	appQuery,
} )
	.argv( process.argv, async ( arg, opts ) => {
		const isShellMode = 'shell' === arg[ 0 ];
		const cmd = arg.join( ' ' );

		const { id: appId, name: appName } = opts.app;
		const { id: envId, name: envName } = opts.env;

		let result;
		let rl;

		if ( isShellMode ) {
			console.log( `Entering WP-CLI shell mode for ${ appName } (${ appId }) and ${ envName } (${ envId }) environment.` );

			rl = readline.createInterface( {
				input: process.stdin,
				output: process.stdout,
				terminal: true,
				prompt: 'wp> ',
				// TODO make history persistent across sessions for same env
				historySize: 200,
			} );
		}

		try {
			result = await launchCommandOnEnv( appId, envId, cmd );
		} catch ( e ) {
			console.log( e );

			return;
		}

		const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

		await trackEvent( 'wp_cli_command_execute' );

		const token = await Token.get();
		const socket = SocketIO( `${ API_HOST }/wp-cli`, {
			path: '/websockets',
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
