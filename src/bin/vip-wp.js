#!/usr/bin/env node

import { CombinedGraphQLErrors } from '@apollo/client/core';
import chalk from 'chalk';
import debugLib from 'debug';
import gql from 'graphql-tag';
import readline from 'readline';
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';
import { Transform, Writable } from 'stream';

import { WPCliCommandOverSSH } from '../commands/wp-ssh';
import API, { API_HOST, disableGlobalGraphQLErrorHandling } from '../lib/api';
import { isAppNodejs } from '../lib/app';
import commandWrapper, { getEnvIdentifier } from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, requoteArgs } from '../lib/cli/format';
import { confirm } from '../lib/cli/prompt';
import { createProxyAgent } from '../lib/http/proxy-agent';
import Token from '../lib/token';
import { trackEvent } from '../lib/tracker';
import { initState, resetState, stateMachine } from '../lib/wp/helpers';
import { safePause, safePrompt, safeResume, safeWrite, trackReadline } from '../lib/wp/readline';

const debug = debugLib( '@automattic/vip:wp' );

const appQuery = `id, name, typeId,
	organization {
		id
		name
	}
	environments {
	id
	appId
	type
	name
	wpcliStrategy
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
const isStdinTty = process.stdin.isTTY;

const normalizeNewlineStream = new Transform( {
	transform( chunk, encoding, callback ) {
		callback( null, chunk.toString().replace( /\r/g, '\n' ) );
	},
} );

const pipeStreamsToProcess = ( { stdin, stdout: outStream } ) => {
	if ( isStdinTty ) {
		process.stdin.pipe( normalizeNewlineStream ).pipe( stdin );
	} else {
		process.stdin.pipe( stdin );
	}

	outStream.pipe( process.stdout );
};

const unpipeStreamsFromProcess = ( { stdin, stdout: outStream } ) => {
	if ( isStdinTty ) {
		process.stdin.unpipe( normalizeNewlineStream );
		normalizeNewlineStream.unpipe( stdin );
	} else {
		process.stdin.unpipe( stdin );
	}

	outStream.unpipe( process.stdout );
};

const finishCommand = ( {
	subShellRl,
	commonTrackingParams,
	isSubShell,
	exitCode = 0,
	job = currentJob,
} ) => {
	if ( job !== currentJob || job.finished ) {
		return;
	}

	currentJob.finished = true;
	clearTimeout( currentJob.exitTimer );
	clearTimeout( currentJob.retryTimer );
	subShellRl.clearLine();
	commandRunning = false;

	const tracking = trackEvent( 'wpcli_command_end', commonTrackingParams ).catch( () => {} );

	currentJob.socket.close();
	unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );
	currentOffset = 0;
	if ( ! isSubShell ) {
		subShellRl.close();
		tracking.then( () => process.exit( exitCode ) );
		return;
	}

	if ( exitCode ) {
		console.log( chalk.red( `Error: WP-CLI command failed with exit code ${ exitCode }` ) );
	}

	safeResume( subShellRl );
	safePrompt( subShellRl );
};

const bindStreamEvents = ( { subShellRl, commonTrackingParams, isSubShell, stdoutStream } ) => {
	const job = currentJob;
	const isCurrentStream = () =>
		job === currentJob && ! job.finished && stdoutStream === job.stdoutStream;
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
		if ( ! isCurrentStream() ) {
			return;
		}
		commandRunning = false;

		if ( criticalErrors.includes( err.code ) ) {
			console.error( `Error: ${ err.message }` );
		} else {
			// TODO handle this better
			debug( 'Error: ' + err.message );
		}
	} );

	stdoutStream.on( 'end', () => {
		// Allow the server's exit event to deliver its status after stdout EOF.
		if ( isCurrentStream() ) {
			clearTimeout( job.exitTimer );
			job.exitTimer = setTimeout( () => {
				if ( isCurrentStream() ) {
					finishCommand( { subShellRl, commonTrackingParams, isSubShell, job } );
				}
			}, 2000 );
		}
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

/**
 * Returns the error so it can be caught by the `socket.on('error')`.
 *
 * @param {Error} err
 * @returns {Error}
 */
const onSocketError = err => err;

const launchCommandAndGetStreams = ( { socket, guid, inputToken, offset = 0 } ) => {
	const stdoutStream = IOStream.createStream();
	const stdinStream = IOStream.createStream();

	stdoutStream.on( 'data', data => {
		if ( currentJob?.stdoutStream === stdoutStream && ! currentJob.finished ) {
			currentOffset += data.length;
		}
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

	const onUnauthorized = err => {
		if ( currentJob?.socket !== socket || currentJob.finished ) {
			return;
		}
		console.log( 'There was an error with the authentication:', err.message );
	};

	const onCancel = message => {
		if ( currentJob?.socket !== socket || currentJob.finished ) {
			return;
		}
		socket.close();
		exit.withError( `Cancel received from server: ${ message }` );
	};

	IOStream( socket ).off( 'error', onSocketError ).on( 'error', onSocketError );

	const onError = err => {
		if ( currentJob?.socket !== socket || currentJob.finished ) {
			return;
		}
		if ( err === 'Rate limit exceeded' ) {
			console.log(
				chalk.red( '\nError:' ),
				'Rate limit exceeded: Please wait a moment and try again.'
			);
			return;
		}

		console.log( err );
	};
	if ( currentJob?.socket === socket ) {
		for ( const [ event, handler ] of Object.entries( currentJob.socketHandlers ) ) {
			socket.off( event, handler );
		}
	}
	const socketHandlers = { unauthorized: onUnauthorized, cancel: onCancel, error: onError };
	for ( const [ event, handler ] of Object.entries( socketHandlers ) ) {
		socket.on( event, handler );
	}

	return { stdinStream, stdoutStream, socket, socketHandlers };
};

const bindReconnectEvents = ( {
	cliCommand,
	inputToken,
	subShellRl,
	commonTrackingParams,
	isSubShell,
} ) => {
	const job = currentJob;
	const isCurrentJob = () => job === currentJob && ! job.finished;
	currentJob.socket.io.removeAllListeners( 'reconnect' );
	currentJob.socket.io.removeAllListeners( 'reconnect_attempt' );
	currentJob.socket.removeAllListeners( 'retry' );
	currentJob.socket.removeAllListeners( 'connect_error' );
	currentJob.socket.removeAllListeners( 'exit' );

	currentJob.socket.io.on( 'reconnect', () => {
		if ( ! isCurrentJob() ) {
			return;
		}
		debug( 'socket.io: reconnect' );
		clearTimeout( job.exitTimer );
		clearTimeout( job.retryTimer );

		// Close old streams
		unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		trackEvent( 'wpcli_command_reconnect', commonTrackingParams ).catch( () => {} );

		job.finished = true;
		currentJob = launchCommandAndGetStreams( {
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
		safeResume( subShellRl );
	} );

	currentJob.socket.on( 'retry', () => {
		if ( ! isCurrentJob() ) {
			return;
		}
		debug( 'socket: retry' );

		clearTimeout( job.retryTimer );
		job.retryTimer = setTimeout( () => {
			if ( isCurrentJob() ) {
				job.socket.io.engine.close();
			}
		}, 5000 );
	} );

	currentJob.socket.on( 'connect_error', () => {
		if ( ! isCurrentJob() ) {
			return;
		}
		debug( 'socket: connect_error; forcing the preference for websocket' );

		// Force the preference for WebSocket in case we see an error during connection
		// https://socket.io/docs/v3/client-initialization/#low-level-engine-options
		currentJob.socket.io.opts.transports = [ 'websocket', 'polling' ];
	} );

	currentJob.socket.on( 'exit', ( { exitCode, message } ) => {
		if ( ! isCurrentJob() ) {
			return;
		}
		debug( 'socket: exit. Code: %d. Message: %s', exitCode, message );

		if ( message ) {
			console.log( message );
		}

		currentJob.stdinStream.destroy();
		currentJob.stdoutStream.destroy();
		finishCommand( { subShellRl, commonTrackingParams, isSubShell, exitCode } );
	} );

	currentJob.socket.io.on( 'reconnect_attempt', attempt => {
		if ( ! isCurrentJob() ) {
			return;
		}
		debug( 'There was an error connecting to the server. Retrying...' );

		if ( attempt > 1 ) {
			return;
		}
		clearTimeout( job.exitTimer );
		clearTimeout( job.retryTimer );

		// create a new input stream so that we can still catch things like SIGINT while reconnecting
		if ( currentJob.stdinStream ) {
			unpipeStreamsFromProcess( {
				stdin: currentJob.stdinStream,
				stdout: currentJob.stdoutStream,
			} );
		}

		currentJob.stdinStream = IOStream.createStream();
		currentJob.stdoutStream = IOStream.createStream();

		pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

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
			typeId: appTypeId,
			organization: { id: orgId },
		} = opts.app;
		const { id: envId, type: envName } = opts.env;

		if ( isAppNodejs( appTypeId ) ) {
			exit.withError( 'WP-CLI commands are not supported on Node.js environments.' );
		}

		const commonTrackingParams = {
			command: commandForAnalytics,
			app_id: appId,
			env_id: envId,
			org_id: orgId,
			method: isSubShell ? 'subshell' : 'shell',
		};

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

		if ( opts.env.wpcliStrategy === 'ssh' ) {
			const wpCommandRunner = new WPCliCommandOverSSH( opts.app, opts.env );
			await wpCommandRunner.run( cmd, { command: commandForAnalytics } );
			return;
		}

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
			crlfDelay: Infinity,
		};

		if ( isSubShell ) {
			subShellSettings.prompt =
				chalk.bold.yellowBright( `${ promptIdentifier }:` ) + chalk.blue( '~' ) + '$ ';
			subShellSettings.historySize = 200;
		}

		const commandState = initState();
		let seenWP = false;

		const subShellRl = readline.createInterface( subShellSettings );
		trackReadline( subShellRl );
		subShellRl.on( 'line', async line => {
			if ( commandRunning ) {
				return;
			}

			// Handle plain return / newline
			if ( ! line ) {
				safePrompt( subShellRl );
				return;
			}

			// Check for exit, like SSH (handles both `exit` and `exit;`)
			if ( ! seenWP && line.startsWith( 'exit' ) ) {
				subShellRl.close();
				process.exit();
			}

			const userCmdCancelled = line === cancelCommandChar;
			if ( userCmdCancelled ) {
				seenWP = false;
				resetState( commandState );
				safePrompt( subShellRl );
				return;
			}

			if ( ! seenWP && line.trimStart().startsWith( 'wp ' ) ) {
				seenWP = true;
				resetState( commandState );
			}

			if ( seenWP ) {
				stateMachine( commandState, line );
				if ( ! commandState.done ) {
					return;
				}
			} else {
				resetState( commandState );
				console.log(
					chalk.red( 'Error:' ),
					'invalid command, please pass a valid WP-CLI command.'
				);
				safePrompt( subShellRl );
				return;
			}

			safePause( subShellRl );
			countSIGINT = 0;

			let result;
			const wpCliCmd = commandState.command.replace( /^wp\s+/, '' );
			seenWP = false;
			resetState( commandState );

			try {
				result = await getTokenForCommand( appId, envId, wpCliCmd );
			} catch ( error ) {
				// If this was a GraphQL error, print that to the message to the line
				if ( CombinedGraphQLErrors.is( error ) ) {
					for ( const err of error.errors ) {
						console.log( chalk.red( 'Error:' ), err.message );
					}
				} else {
					// Else, other type of error, just dump it
					console.log( error );
				}

				if ( ! isSubShell ) {
					subShellRl.close();
					process.exit( 1 );
				}

				safePrompt( subShellRl );
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

			currentJob = launchCommandAndGetStreams( {
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
			safeWrite( subShellRl, `wp ${ cmd }\n` );
			mutableStdout.muted = false;
			return;
		}

		safePrompt( subShellRl );
	} );
