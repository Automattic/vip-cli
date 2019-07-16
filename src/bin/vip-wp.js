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
import { EOL } from 'os';
import { Writable } from 'stream';

/**
 * Internal dependencies
 */
import API, { API_HOST, disableGlobalGraphQLErrorHandling } from 'lib/api';
import commandWrapper, { getEnvIdentifier } from 'lib/cli/command';
import { formatEnvironment, requoteArgs } from 'lib/cli/format';
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

const NON_TTY_COLUMNS = 100;
const NON_TTY_ROWS = 15;

let currentJob = null;

const pipeStreamsToProcess = ( { stdin, stdout: outStream } ) => {
	process.stdin.pipe( stdin );
	outStream.pipe( process.stdout );
};

const unpipeStreamsFromProcess = ( { stdin, stdout: outStream } ) => {
	process.stdin.unpipe( stdin );
	outStream.unpipe( process.stdout );
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
		columns: process.stdout.columns || NON_TTY_COLUMNS,
		rows: process.stdout.rows || NON_TTY_ROWS,
	};

	IOStream( socket ).emit( 'cmd', data, stdinStream, stdoutStream );

	socket.on( 'unauthorized', err => {
		console.log( 'There was an error with the authentication:', err.message );
	} );

	socket.on( 'disconnect', err => {
		console.log( 'lost connection' );
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

	return { stdinStream, stdoutStream, socket };
};

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

		const { id: appId, name: appName } = opts.app;
		const { id: envId, type: envName } = opts.env;

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
				await trackEvent( 'wpcli_confirm_cancel', {
					command: commandForAnalytics,
				} );

				console.log( 'Command cancelled' );
				process.exit();
			}
		}

		// We'll handle our own errors, thank you
		disableGlobalGraphQLErrorHandling();

		const promptIdentifier = `${ appName }.${ getEnvIdentifier( opts.env ) }`;

		let commandRunning = false;

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

			if ( empty || ! startsWithWp ) {
				console.log( chalk.red( 'Error:' ), 'invalid command, please pass a valid WP CLI command.' );
				subShellRl.prompt();
				return;
			}

			subShellRl.pause();

			let result;
			try {
				result = await getTokenForCommand( appId, envId, line.replace( 'wp ', '' ) );
			} catch ( e ) {
				// If this was a GraphQL error, print that to the message to the line
				if ( e.graphQLErrors ) {
					e.graphQLErrors.forEach( error => {
						console.log( chalk.red( 'Error:' ), error.message );
					} );
				} else {
					// Else, other type of error, just dump it
					console.log( e );
				}

				if ( ! isSubShell ) {
					subShellRl.close();
					process.exit( 1 );
				}

				subShellRl.prompt();
				return;
			}

			const { data: { triggerWPCLICommandOnAppEnvironment: { command: cliCommand, inputToken } } } = result;

			currentJob = await launchCommandAndGetStreams( {
				guid: cliCommand.guid,
				inputToken: inputToken,
			} );

			pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

			commandRunning = true;

			currentJob.stdoutStream.on( 'error', err => {
				commandRunning = false;

				// TODO handle this better
				console.log( err );
			} );

			currentJob.socket.on( 'reconnect', async () => {
				console.log( 'reconnected' );

				// Close old streams
				unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

				currentJob = await launchCommandAndGetStreams( {
					guid: cliCommand.guid,
					inputToken: inputToken,
				} );

				// Rebind new streams
				pipeStreamsToProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

				// Resume readline interface
				subShellRl.resume();
			} );

			currentJob.stdoutStream.on( 'end', () => {
				subShellRl.clearLine();
				commandRunning = false;

				// Tell socket.io to stop trying to connect
				currentJob.socket.close();
				unpipeStreamsFromProcess( { stdin: currentJob.stdinStream, stdout: currentJob.stdoutStream } );

				// Need a newline - WP CLI doesn't always send one :(
				// https://github.com/wp-cli/wp-cli/blob/779bdd16025cb718260b35fd2b69ae47ca80cb91/php/WP_CLI/Formatter.php#L129-L141
				if ( line.includes( '--format=count' ) ||
					line.includes( '--format="count"' ) ||
					line.includes( '--format=\'count\'' ) ||
					line.includes( '--format=ids' ) ||
					line.includes( '--format="ids"' ) ||
					line.includes( '--format=\'ids\'' ) ) {
					process.stdout.write( EOL );
				}

				if ( ! isSubShell ) {
					subShellRl.close();
					process.exit();
					return;
				}

				subShellRl.resume();
				subShellRl.prompt();
			} );
		} );

		subShellRl.on( 'SIGINT', () => {
			subShellRl.close();
			process.exit();
		} );

		if ( ! isSubShell ) {
			mutableStdout.muted = true;
			subShellRl.write( `wp ${ cmd }\n` );
			mutableStdout.muted = false;
			return;
		}

		subShellRl.prompt();
	} );
