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
import commandWrapper, { getEnvIdentifier } from 'lib/cli/command';
import { formatEnvironment } from 'lib/cli/format';
import { confirm } from 'lib/cli/prompt';
import { trackEvent } from 'lib/tracker';
import Token from '../lib/token';

const appQuery = `id, name, environments {
	id
	appId
	type
	name
	primaryDomain {
		name
	}
}`;

const getTokenForCommand = async ( appId, envId, command ) => {
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

const launchCommandAndGetStreams = async ( { guid, inputToken } ) => {
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
		guid,
		inputToken,
		columns: process.stdout.columns,
		rows: process.stdout.rows,
	};

	IOStream( socket ).emit( 'cmd', data, stdinStream, stdoutStream );

	socket.on( 'unauthorized', err => {
		console.log( 'There was an error with the authentication:', err.message );
	} );

	IOStream( socket ).on( 'error', err => {
		// This returns the error so it can be catched by the socket.on('error')
		return err;
	} );

	socket.on( 'error', err => {
		if ( err === 'Rate limit exceeded' ) {
			console.log( chalk.red( '\nError:' ), 'Rate limit exceeded: Please wait a moment and try again.' );
			return;
		}

		console.log( err );
	} );

	return { stdinStream, stdoutStream };
};

commandWrapper( {
	wildcardCommand: true,
	appContext: true,
	envContext: true,
	appQuery,
} )
	.argv( process.argv, async ( arg, opts ) => {
		const isShellMode = 'shell' === arg[ 0 ];
		const isSubShell = 0 === arg.length;
		const cmd = arg.join( ' ' );

		// Store only the first 2 parts of command to avoid recording secrets. Can be tweaked
		const commandForAnalytics = arg.slice( 0, 2 ).join( ' ' );

		const { id: appId, name: appName } = opts.app;
		const { id: envId, type: envName } = opts.env;

		let result;
		let rl;
		let subShellRl;

		if ( isSubShell ) {
			console.log( `Welcome to the WP CLI shell for the ${ formatEnvironment( envName ) } environment of ${ chalk.green( appName ) } (${ opts.env.primaryDomain.name })!` );

			const promptIdentifier = `${ appName }.${ getEnvIdentifier( opts.env ) }`;

			let commandRunning = false;

			subShellRl = readline.createInterface( {
				input: process.stdin,
				output: process.stdout,
				terminal: true,
				prompt: chalk`{bold.yellowBright ${ promptIdentifier }:}{blue ~}$` + ' ', // Must pad with plain string (non-chalk template literal), otherwise cursor doesn't work
				// TODO make history persistent across sessions for same env
				historySize: 200,
			} );

			subShellRl.on( 'line', async line => {
				if ( commandRunning ) {
					return;
				}

				// Handle plain return / newline
				if ( ! line ) {
					subShellRl.prompt();

					return;
				}

				// Check for exit, like SSH (handles both `exit` and `exit;`)
				if ( line.startsWith( 'exit' ) ) {
					subShellRl.close();

					process.exit();
				}

				const startsWithWp = line.startsWith( 'wp ' );
				const empty = 0 === line.length;
				const isShellCommand = line.startsWith( 'wp shell ' );

				if ( empty || ! startsWithWp ) {
					console.log( chalk.red( 'Error:' ), 'invalid command, please pass a valid WP CLI command.' );

					subShellRl.prompt();

					return;
				}

				if ( isShellCommand ) {
					console.log( chalk.red( 'Error:' ), 'you can not run \'wp shell\' in the subshell mode.' );
					return;
				}

				subShellRl.pause();

				try {
					result = await getTokenForCommand( appId, envId, line.replace( 'wp ', '' ) );
				} catch ( e ) {
					console.log( e );

					return;
				}

				const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

				const commandStreams = await launchCommandAndGetStreams( {
					guid: cliCommand.guid,
					inputToken: inputToken,
				} );

				process.stdin.pipe( commandStreams.stdinStream );

				commandStreams.stdoutStream.pipe( process.stdout );
				commandRunning = true;

				commandStreams.stdoutStream.on( 'error', err => {
					commandRunning = false;

					// TODO handle this better
					console.log( err );
				} );

				commandStreams.stdoutStream.on( 'end', () => {
					commandRunning = false;

					process.stdin.unpipe( commandStreams.stdinStream );

					commandStreams.stdoutStream.unpipe( process.stdout );

					subShellRl.resume();

					subShellRl.prompt();
				} );
			} );

			subShellRl.prompt();

			subShellRl.on( 'SIGINT', () => {
				subShellRl.close();

				process.exit();
			} );

			return;
		}

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
			result = await getTokenForCommand( appId, envId, cmd );
		} catch ( e ) {
			console.log( e );

			return;
		}

		const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

		await trackEvent( 'wpcli_command_execute', {
			command: commandForAnalytics,
			guid: cliCommand.guid,
		} );

		const commandStreams = await launchCommandAndGetStreams( {
			guid: cliCommand.guid,
			inputToken: inputToken,
		} );

		if ( isShellMode ) {
			rl.on( 'SIGINT', () => {
				rl.question( 'Are you sure you want to exit? ', answer => {
					if ( answer.match( /^y(es)?$/i ) ) {
						commandStreams.stdinStream.write( 'exit();\n' );
						process.exit();
					} else {
						rl.prompt();
					}
				} );
			} );
		}

		process.stdin.pipe( commandStreams.stdinStream );

		commandStreams.stdoutStream.pipe( process.stdout );

		commandStreams.stdoutStream.on( 'error', err => {
			// TODO handle this better
			console.log( err );

			process.exit( 1 );
		} );

		commandStreams.stdoutStream.on( 'end', () => {
			process.exit();
		} );
	} );
