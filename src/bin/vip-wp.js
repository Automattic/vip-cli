#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';
import readline from 'readline';
import { Writable } from 'stream';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import API, { API_HOST, disableGlobalGraphQLErrorHandling } from 'lib/api';
import commandWrapper, { getEnvIdentifier } from 'lib/cli/command';
import * as exit from 'lib/cli/exit';
import { formatEnvironment, requoteArgs } from 'lib/cli/format';
import { confirm } from 'lib/cli/prompt';
import { trackEvent } from 'lib/tracker';
import Token from '../lib/token';
import { rollbar } from 'lib/rollbar';
import { createProxyAgent } from 'lib/http/proxy-agent';

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

const PERMITTED_DB_COMMANDS = [ 'cli', 'columns', 'export', 'prefix', 'query', 'search', 'size', 'tables' ];

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
	stdoutStream.on( 'error', err => {
		commandRunning = false;

		// TODO handle this better
		console.error( 'Error: ' + err.message );
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

// eslint-disable-next-line no-unused-vars
const cancelCommand = async guid => {
	const api = await API();
	return api
		.mutate( {
		// $FlowFixMe: gql template is not supported by flow
			mutation: gql`
			mutation cancelWPCLICommand($input: CancelWPCLICommandInput ){
				cancelWPCLICommand( input: $input ) {
					command {
						id
					}
				}
			}
		`,
			variables: {
				input: {
					guid: guid,
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
		rollbar.error( err );
		return err;
	} );

	socket.on( 'error', err => {
		if ( err === 'Rate limit exceeded' ) {
			console.log( chalk.red( '\nError:' ), 'Rate limit exceeded: Please wait a moment and try again.' );
			return;
		}

		rollbar.error( err );
		console.log( err );
	} );

	return { stdinStream, stdoutStream, socket };
};

const bindReconnectEvents = ( { cliCommand, inputToken, subShellRl, commonTrackingParams, isSubShell } ) => {
	currentJob.socket.io.removeAllListeners( 'reconnect' );
	currentJob.socket.io.removeAllListeners( 'reconnect_attempt' );
	currentJob.socket.removeAllListeners( 'retry' );

	currentJob.socket.io.on( 'reconnect', async () => {
		debug( 'socket.io: reconnect' );
		rollbar.info( 'WP-CLI socket.io.on( \'reconnect\' )', { custom: { code: 'wp-cli-on-reconnect', commandGuid: cliCommand.guid } } );

		// Close old streams
		unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		trackEvent( 'wpcli_command_reconnect', commonTrackingParams );

		currentJob = await launchCommandAndGetStreams( {
			socket: currentJob.socket,
			guid: cliCommand.guid,
			inputToken: inputToken,
			offset: currentOffset,
		} );

		// Rebind new streams
		pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

		bindStreamEvents( { subShellRl, isSubShell, commonTrackingParams, stdoutStream: currentJob.stdoutStream } );

		bindReconnectEvents( { cliCommand, inputToken, subShellRl, commonTrackingParams, isSubShell } );

		// Resume readline interface
		subShellRl.resume();
	} );

	currentJob.socket.on( 'retry', async () => {
		debug( 'socket: retry' );
		rollbar.info( 'WP-CLI socket.io.on( \'retry\' )', { custom: { code: 'wp-cli-on-retry', commandGuid: cliCommand.guid } } );

		setTimeout( () => {
			currentJob.socket.io.engine.close();
		}, 5000 );
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
		console.error( 'There was an error connecting to the server. Retrying...' );

		if ( attempt > 1 ) {
			return;
		}

		// create a new input stream so that we can still catch things like SIGINT while reconnecting
		if ( currentJob.stdinStream ) {
			process.stdin.unpipe( currentJob.stdinStream );
		}
		process.stdin.pipe( IOStream.createStream() );
		currentJob.stdoutStream = IOStream.createStream();
		bindStreamEvents( { subShellRl, isSubShell, commonTrackingParams, stdoutStream: currentJob.stdoutStream } );
	} );
};

function printDbUsage() {
	console.log( 'TODO: Print usage' );
}

commandWrapper( {
	wildcardCommand: true,
	appContext: true,
	envContext: true,
	appQuery,
} )
	.option( 'yes', 'Run the command in production without a confirmation prompt' )
	.argv( process.argv, async ( args, opts ) => {
		const isSubShell = 0 === args.length;

		// Have to re-quote anything that needs it before we pass it on
		const quotedArgs = requoteArgs( args );
		const cmd = quotedArgs.join( ' ' );

		// Store only the first 2 parts of command to avoid recording secrets. Can be tweaked
		const commandForAnalytics = quotedArgs.slice( 0, 2 ).join( ' ' );

		const { id: appId, name: appName, organization: { id: orgId } } = opts.app;
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

		trackEvent( 'wpcli_command_execute', commonTrackingParams );

		if ( isSubShell ) {
			// Reset the cursor (can get messed up with enquirer)
			process.stdout.write( '\u001b[?25h' );
			console.log( `Welcome to the WP CLI shell for the ${ formatEnvironment( envName ) } environment of ${ chalk.green( appName ) } (${ opts.env.primaryDomain.name })!` );
		} else if ( envName === 'production' ) {
			const yes = opts.yes || await confirm( [
				{
					key: 'command',
					value: `wp ${ cmd }`,
				},
			], `Are you sure you want to run this command on ${ formatEnvironment( envName ) } for site ${ appName }?` );

			if ( ! yes ) {
				trackEvent( 'wpcli_confirm_cancel', commonTrackingParams );

				console.log( 'Command cancelled' );
				process.exit();
			}
		}

		// We'll handle our own errors, thank you
		disableGlobalGraphQLErrorHandling();

		if ( args?.length > 0 && 'db' === args[ 0 ].toLowerCase() ) {
			const dbArgs = args.slice( 1 );
			const dbSubcommand = ( dbArgs.shift() || '' ).toLowerCase();
			debug( `command: db, subcommand: ${ dbSubcommand }` );
			if ( '' === dbSubcommand ) {
				console.error( 'ERROR: db subcommand is missing.' );
				printDbUsage();
				process.exit( 1 );
			}
			if ( ! PERMITTED_DB_COMMANDS.includes( dbSubcommand ) ) {
				console.error( `ERROR: Unsupported db subcommand: ${ dbSubcommand }` );
				printDbUsage();
				process.exit( 1 );
			}

			if ( 'cli' === dbSubcommand || ( 'query' === dbSubcommand && ! dbArgs.length ) ) {
				console.log( `Welcome to the WPVIP database console for ${ appId }.${ envName } (${ appName })` );
				console.log( 'Please visit this page for more information: https://wpvip.com/example-doc-link-FIXME' );

				debug( 'starting db repl' );

				let buffer = '';

				const repl = require( 'repl' );
				const replServer = repl.start( {
					prompt: `wp db (${ appId }.${ envName }) > `,
					eval: async function( dbCommand, _context, _filename, callback ) {
						const _dbCommand = dbCommand.trim();
						const sendIt = _dbCommand.endsWith( ';' );
						buffer += _dbCommand;
						debug( { _dbCommand, buffer } );
						if ( ! sendIt ) {
							if ( _dbCommand.length ) {
								buffer += ' ';
							}
							callback();
							return;
						}

						// Pass all input to a `wp db query` command.
						const toSend = `db query "${ buffer }"`;

						// Clear the buffer for the next query.
						buffer = '';

						debug( `Issuing db command: ${ toSend }` );

						let result;
						try {
							result = await getTokenForCommand( appId, envId, toSend );
						} catch ( error ) {
							const [ gqlError ] = error?.graphQLErrors || [];
							const errorMessage = `ERROR: ${ gqlError?.message || 'Could not execute the query.' }`;
							callback( errorMessage );
							return;
						}

						// Finish the evaluation and return to the prompt.
						debug( 'Finished db command evaluation.' );
						if ( ! result ) {
							callback();
							return;
						}
						const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

						const token = await Token.get();
						const socket = SocketIO( `${ API_HOST }/wp-cli`, {
							transportOptions: {
								polling: {
									extraHeaders: {
										Authorization: `Bearer ${ token.raw }`,
									},
								},
							},
							agent: createSocksProxyAgent(),
						} );

						currentJob = await launchCommandAndGetStreams( {
							socket,
							guid: cliCommand.guid,
							inputToken: inputToken,
						} );

						currentJob.stdoutStream.on( 'end', callback );
						currentJob.stdoutStream.pipe( process.stdout );
					},
				} );

				replServer.on( 'exit', () => {
					debug( 'db repl server exited. Exiting process.' );
					process.exit();
				} );

				// The repl will handle it from here.
				return;
			}
		}

		const promptIdentifier = `${ appName }.${ getEnvIdentifier( opts.env ) }`;

		let countSIGINT = 0;

		const mutableStdout = new Writable( {
			write: function( chunk, encoding, callback ) {
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
				console.log( chalk.red( 'Error:' ), 'invalid command, please pass a valid WP CLI command.' );
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
					rollbar.error( error );
					console.log( error );
				}

				if ( ! isSubShell ) {
					subShellRl.close();
					process.exit( 1 );
				}

				subShellRl.prompt();
				return;
			}

			const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

			if ( line.includes( "'" ) ) {
				rollbar.info( 'WP-CLI Command containing single quotes', { custom: { code: 'wp-cli-single-quotes', commandGuid: cliCommand.guid } } );
			}

			const token = await Token.get();
			const socket = SocketIO( `${ API_HOST }/wp-cli`, {
				transportOptions: {
					polling: {
						extraHeaders: {
							Authorization: `Bearer ${ token.raw }`,
						},
					},
				},
				agent: createProxyAgent( API_HOST ),
			} );

			currentJob = await launchCommandAndGetStreams( {
				socket,
				guid: cliCommand.guid,
				inputToken: inputToken,
			} );

			pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

			commandRunning = true;

			bindStreamEvents( { subShellRl, commonTrackingParams, isSubShell, stdoutStream: currentJob.stdoutStream } );

			bindReconnectEvents( { cliCommand, inputToken, subShellRl, commonTrackingParams, isSubShell } );
		} );

		// Fix to re-add the \n character that readline strips when terminal == true
		process.stdin.on( 'data', data => {
			// only run this in interactive mode for prompts from WP commands
			if ( commandRunning && 0 === Buffer.compare( data, Buffer.from( '\r' ) ) ) {
				if ( currentJob && currentJob.stdinStream ) {
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

			if ( currentJob && currentJob.stdoutStream ) {
				currentJob.stdoutStream.end();
			}

			await trackEvent( 'wpcli_cancel_command', commonTrackingParams );

			console.log( 'Command cancelled by user' );

			// if no command running (.e.g. interactive shell, exit only after doing cleanup)
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
