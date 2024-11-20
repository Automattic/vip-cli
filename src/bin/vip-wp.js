#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';
import gql from 'graphql-tag';
import readline from 'readline';
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';
import { Writable } from 'stream';

import API, { API_HOST, disableGlobalGraphQLErrorHandling } from '../lib/api';
import commandWrapper, { getEnvIdentifier } from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, requoteArgs } from '../lib/cli/format';
import { confirm } from '../lib/cli/prompt';
import { createProxyAgent } from '../lib/http/proxy-agent';
import Token from '../lib/token';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:wp' );

const appQuery = `id, name,
	organization {
		id
		name
	}
	environments {
	id
	appId
	type
	name
	primaryDomain {
		name
	}
}`;

const NON_TTY_COLUMNS = 100;
const NON_TTY_ROWS = 15;
const cancelCommandChar = '\x03';

let currentJob = null;
let currentOffset = 0;
let commandRunning = false;

const pipeStreamsToProcess = ( { stdin, stdout: outStream } ) => {
	process.stdin.pipe( stdin );
	outStream.pipe( process.stdout );
};

const unpipeStreamsFromProcess = ( { stdin, stdout: outStream } ) => {
	process.stdin.unpipe( stdin );
	outStream.unpipe( process.stdout );
};

const bindStreamEvents = ( { subShellRl, commonTrackingParams, isSubShell, stdoutStream } ) => {
	const criticalErrors = [
		'ECONNRESET',
		'ETIMEDOUT',
		'EHOSTUNREACH',
		'ENOSPC',
		'EACCES',
		'EMFILE',
		'ENOMEM',
	];

	stdoutStream.on( 'error', err => {
		commandRunning = false;

		if ( criticalErrors.includes( err.code ) ) {
			console.error( `Error: ${ err.message }` );
		} else {
			// TODO handle this better
			debug( 'Error: ' + err.message );
		}
	} );

	stdoutStream.on( 'end', async () => {
		subShellRl.clearLine();
		commandRunning = false;

		await trackEvent( 'wpcli_command_end', commonTrackingParams );

		// Tell socket.io to stop trying to connect
		currentJob.socket.close();
		unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		// Reset offset
		currentOffset = 0;

		if ( ! isSubShell ) {
			subShellRl.close();
			process.exit();
			return;
		}
		subShellRl.resume();
		subShellRl.prompt();
	} );
};

const getTokenForCommand = async ( appId, envId, command ) => {
	const api = API();

	return api.mutate( {
		mutation: gql`
			mutation TriggerWPCLICommandMutation($input: AppEnvironmentTriggerWPCLICommandInput) {
				triggerWPCLICommandOnAppEnvironment(input: $input) {
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

const launchCommandAndGetStreams = async ( { socket, guid, inputToken, offset = 0 } ) => {
	const stdoutStream = IOStream.createStream();
	const stdinStream = IOStream.createStream();

	stdoutStream.on( 'data', data => {
		currentOffset = data.length + currentOffset;
	} );

	// TODO handle all arguments
	// TODO handle disconnect - does IOStream correctly buffer stdin?
	// TODO stderr - currently server doesn't support it, so errors don't terminate process

	const data = {
		guid,
		inputToken,
		columns: process.stdout.columns || NON_TTY_COLUMNS,
		rows: process.stdout.rows || NON_TTY_ROWS,
		offset,
	};

	IOStream( socket ).emit( 'cmd', data, stdinStream, stdoutStream );

	socket.on( 'unauthorized', err => {
		console.log( 'There was an error with the authentication:', err.message );
	} );

	socket.on( 'cancel', message => {
		socket.close();
		exit.withError( `Cancel received from server: ${ message }` );
	} );

	IOStream( socket ).on( 'error', err => {
		// This returns the error so it can be catched by the socket.on('error')
		return err;
	} );

	socket.on( 'error', err => {
		if ( err === 'Rate limit exceeded' ) {
			console.log(
				chalk.red( '\nError:' ),
				'Rate limit exceeded: Please wait a moment and try again.'
			);
			return;
		}

		console.log( err );
	} );

	return { stdinStream, stdoutStream, socket };
};

const bindReconnectEvents = ( {
	cliCommand,
	inputToken,
	subShellRl,
	commonTrackingParams,
	isSubShell,
} ) => {
	currentJob.socket.io.removeAllListeners( 'reconnect' );
	currentJob.socket.io.removeAllListeners( 'reconnect_attempt' );
	currentJob.socket.removeAllListeners( 'retry' );
	currentJob.socket.removeAllListeners( 'connect_error' );

	currentJob.socket.io.on( 'reconnect', async () => {
		debug( 'socket.io: reconnect' );

		// Close old streams
		unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		trackEvent( 'wpcli_command_reconnect', commonTrackingParams ).catch( () => {} );

		currentJob = await launchCommandAndGetStreams( {
			socket: currentJob.socket,
			guid: cliCommand.guid,
			inputToken,
			offset: currentOffset,
		} );

		// Rebind new streams
		pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		bindStreamEvents( {
			subShellRl,
			isSubShell,
			commonTrackingParams,
			stdoutStream: currentJob.stdoutStream,
		} );

		bindReconnectEvents( { cliCommand, inputToken, subShellRl, commonTrackingParams, isSubShell } );

		// Resume readline interface
		subShellRl.resume();
	} );

	currentJob.socket.on( 'retry', async () => {
		debug( 'socket: retry' );

		setTimeout( () => {
			currentJob.socket.io.engine.close();
		}, 5000 );
	} );

	currentJob.socket.on( 'connect_error', () => {
		debug( 'socket: connect_error; forcing the preference for websocket' );

		// Force the preference for WebSocket in case we see an error during connection
		// https://socket.io/docs/v3/client-initialization/#low-level-engine-options
		currentJob.socket.io.opts.transports = [ 'websocket', 'polling' ];
	} );

	currentJob.socket.on( 'exit', async ( { exitCode, message } ) => {
		debug( 'socket: exit. Code: %d. Message: %s', exitCode, message );

		if ( message ) {
			console.log( message );
		}

		currentJob.stdinStream.destroy();
		currentJob.stdoutStream.destroy();
		currentJob.socket.close();
		process.exit( exitCode );
	} );

	currentJob.socket.io.on( 'reconnect_attempt', attempt => {
		debug( 'There was an error connecting to the server. Retrying...' );

		if ( attempt > 1 ) {
			return;
		}

		// create a new input stream so that we can still catch things like SIGINT while reconnecting
		if ( currentJob.stdinStream ) {
			process.stdin.unpipe( currentJob.stdinStream );
		}
		process.stdin.pipe( IOStream.createStream() );
		currentJob.stdoutStream = IOStream.createStream();
		bindStreamEvents( {
			subShellRl,
			isSubShell,
			commonTrackingParams,
			stdoutStream: currentJob.stdoutStream,
		} );
	} );
};

// Command examples
const examples = [
	{
		usage: `vip @example-app.develop -- wp site list`,
		description:
			'Use a WP-CLI command to retrieve the list of network sites on the develop environment of the "example-app" WordPress multisite application.',
	},
	{
		usage: `vip @example-app.production --yes -- wp user list`,
		description:
			'Use a WP-CLI command to retrieve the list of Super Admins on the production environment and automatically answer "yes" to the confirmation prompt.',
	},
	{
		usage: `vip @example-app.develop -- wp post list --posts_per_page=100 --url=dev.example.com`,
		description:
			'Use a WP-CLI command to retrieve the list of posts for the network site dev.example.com.',
	},
	{
		usage:
			`vip @example-app.develop -- wp\n` +
			`    - example-app.develop:~$ wp option get home\n` +
			`    - https://dev.example.com`,
		description:
			'Use the VIP-CLI to launch an interactive WP-CLI shell console and run WP-CLI commands on the develop environment.',
	},
];

commandWrapper( {
	wildcardCommand: true,
	appContext: true,
	envContext: true,
	appQuery,
} )
	.option( 'yes', 'Answer yes to the confirmation prompt (only on production environments).' )
	.examples( examples )
	.argv( process.argv, async ( args, opts ) => {
		const isSubShell = 0 === args.length;

		// Have to re-quote anything that needs it before we pass it on
		const quotedArgs = requoteArgs( args );
		const cmd = quotedArgs.join( ' ' );

		// Store only the first 2 parts of command to avoid recording secrets. Can be tweaked
		const commandForAnalytics = quotedArgs.slice( 0, 2 ).join( ' ' );

		const {
			id: appId,
			name: appName,
			organization: { id: orgId },
		} = opts.app;
		const { id: envId, type: envName } = opts.env;

		/* eslint-disable camelcase */
		const commonTrackingParams = {
			command: commandForAnalytics,
			app_id: appId,
			env_id: envId,
			org_id: orgId,
			method: isSubShell ? 'subshell' : 'shell',
		};
		/* eslint-enable camelcase */

		trackEvent( 'wpcli_command_execute', commonTrackingParams ).catch( () => {} );

		if ( isSubShell ) {
			// Reset the cursor (can get messed up with enquirer)
			process.stdout.write( '\u001b[?25h' );
			console.log(
				`Welcome to the WP-CLI shell for the ${ formatEnvironment(
					envName
				) } environment of ${ chalk.green( appName ) } (${ opts.env.primaryDomain.name })!`
			);
		} else if ( envName === 'production' ) {
			const yes =
				opts.yes ||
				( await confirm(
					[
						{
							key: 'command',
							value: `wp ${ cmd }`,
						},
					],
					`Are you sure you want to run this command on ${ formatEnvironment(
						envName
					) } for site ${ appName }?`
				) );

			if ( ! yes ) {
				trackEvent( 'wpcli_confirm_cancel', commonTrackingParams ).catch( () => {} );

				console.log( 'Command cancelled' );
				process.exit();
			}
		}

		// We'll handle our own errors, thank you
		disableGlobalGraphQLErrorHandling();

		const promptIdentifier = `${ appName }.${ getEnvIdentifier( opts.env ) }`;

		let countSIGINT = 0;

		const mutableStdout = new Writable( {
			write( chunk, encoding, callback ) {
				if ( ! this.muted ) {
					process.stdout.write( chunk, encoding );
				}

				callback();
			},
		} );

		mutableStdout.muted = false;

		const subShellSettings = {
			input: process.stdin,
			output: mutableStdout,
			terminal: true,
			prompt: '',
			historySize: 0,
		};

		if ( isSubShell ) {
			subShellSettings.prompt = chalk`{bold.yellowBright ${ promptIdentifier }:}{blue ~}$ `;
			subShellSettings.historySize = 200;
		}

		const subShellRl = readline.createInterface( subShellSettings );
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
			const userCmdCancelled = line === cancelCommandChar;

			if ( ( empty || ! startsWithWp ) && ! userCmdCancelled ) {
				console.log(
					chalk.red( 'Error:' ),
					'invalid command, please pass a valid WP-CLI command.'
				);
				subShellRl.prompt();
				return;
			}

			subShellRl.pause();

			let result;
			try {
				result = await getTokenForCommand( appId, envId, line.replace( 'wp ', '' ) );
			} catch ( error ) {
				// If this was a GraphQL error, print that to the message to the line
				if ( error.graphQLErrors ) {
					error.graphQLErrors.forEach( err => {
						console.log( chalk.red( 'Error:' ), err.message );
					} );
				} else {
					// Else, other type of error, just dump it
					console.log( error );
				}

				if ( ! isSubShell ) {
					subShellRl.close();
					process.exit( 1 );
				}

				subShellRl.prompt();
				return;
			}

			const {
				data: {
					triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken },
				},
			} = result;

			const token = await Token.get();
			const extraHeaders = {
				Authorization: `Bearer ${ token.raw }`,
			};

			const socket = SocketIO( `${ API_HOST }/wp-cli`, {
				transportOptions: {
					polling: {
						extraHeaders,
					},
					websocket: {
						extraHeaders,
					},
				},
				agent: createProxyAgent( API_HOST ),
			} );

			currentJob = await launchCommandAndGetStreams( {
				socket,
				guid: cliCommand.guid,
				inputToken,
			} );

			pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

			commandRunning = true;

			bindStreamEvents( {
				subShellRl,
				commonTrackingParams,
				isSubShell,
				stdoutStream: currentJob.stdoutStream,
			} );

			bindReconnectEvents( {
				cliCommand,
				inputToken,
				subShellRl,
				commonTrackingParams,
				isSubShell,
			} );
		} );

		// Fix to re-add the \n character that readline strips when terminal == true
		process.stdin.on( 'data', data => {
			// only run this in interactive mode for prompts from WP commands
			if ( commandRunning && 0 === Buffer.compare( data, Buffer.from( '\r' ) ) ) {
				if ( currentJob?.stdinStream ) {
					currentJob.stdinStream.write( '\n' );
				}
			}
		} );

		subShellRl.on( 'SIGINT', async () => {
			// if we have a 2nd SIGINT, exit immediately
			if ( countSIGINT >= 1 ) {
				process.exit();
			}
			countSIGINT += 1;

			// write out CTRL-C/SIGINT
			process.stdin.write( cancelCommandChar );

			if ( currentJob?.stdoutStream ) {
				currentJob.stdoutStream.end();
			}

			await trackEvent( 'wpcli_cancel_command', commonTrackingParams );

			console.log( 'Command cancelled by user' );

			// if no command running (.e.g. interactive shell) exit only after doing cleanup
			if ( commandRunning === false ) {
				process.exit();
			}
		} );

		if ( ! isSubShell ) {
			mutableStdout.muted = true;
			subShellRl.write( `wp ${ cmd }\n` );
			mutableStdout.muted = false;
			return;
		}

		subShellRl.prompt();
	} );
