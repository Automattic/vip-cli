/**
 * External dependencies
 */
import { CombinedGraphQLErrors } from '@apollo/client/core';
import chalk from 'chalk';
import debugLib from 'debug';
import gql from 'graphql-tag';
import * as ssh2 from 'ssh2';

/**
 * Internal dependencies
 */
import pkg from '../../package.json';
import { App, AppEnvironment } from '../graphqlTypes';
import API from '../lib/api';
import { CommandTracker, makeCommandTracker } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:wp/ssh' );

const NON_TTY_COLUMNS = 100;
const NON_TTY_ROWS = 15;

const SSH_HANDSHAKE_TIMEOUT_MS = 5000;

interface TriggerWPCLICommandMutationResponse {
	triggerWPCLICommandOnAppEnvironment: {
		inputToken: string;
		sshAuthentication: {
			host: string;
			port: number;
			username: string;
			privateKey: string;
			passphrase: string;
		};
		command: {
			guid: string;
		};
	};
}

const TRIGGER_WP_CLI_COMMAND_MUTATION = gql`
	mutation TriggerWPCLICommandMutation($input: AppEnvironmentTriggerWPCLICommandInput) {
		triggerWPCLICommandOnAppEnvironment(input: $input) {
			inputToken
			sshAuthentication {
				host
				port
				username
				privateKey
				passphrase
			}
			command {
				guid
			}
		}
	}
`;

export class NonZeroExitCodeError extends Error {
	public guid: string;
	public exitCode: number;

	constructor( message: string, guid: string, exitCode: number ) {
		super( message );
		this.guid = guid;
		this.exitCode = exitCode;
	}
}

export class APIError extends Error {}

export class WPCliCommandOverSSH {
	private readonly track: CommandTracker;

	constructor( private readonly app: App, private readonly env: AppEnvironment ) {
		this.track = makeCommandTracker( 'wp', {
			app: app.id,
			env: env.id,
			execution_type: 'ssh',
		} );
	}

	public async run(
		command: string,
		extraTrackingInfo: Record< string, unknown > = {}
	): Promise< void > {
		if ( ! this.app.id || ! this.env.id ) {
			await this.track( 'error', {
				error: 'no_app_env_id',
				message: 'No app or env ID provided',
				...extraTrackingInfo,
			} );

			throw new Error( 'No app ID or environment ID provided' );
		}

		debug( "Requesting SSH authentication for command '%s'", command );

		try {
			const sshAuth = await this.getSSHAuthForCommand( command, extraTrackingInfo );

			const data = sshAuth.data?.triggerWPCLICommandOnAppEnvironment;

			if ( ! data ) {
				await this.track( 'error', {
					error: 'no_ssh_auth_data',
					message: 'No SSH authentication data received',
					...extraTrackingInfo,
				} );

				throw new Error( 'WP-CLI SSH Authentication failed' );
			}

			debug( 'Connecting to SSH', {
				host: data.sshAuthentication.host,
				port: data.sshAuthentication.port,
				username: data.sshAuthentication.username,
				guid: data.command.guid,
			} );

			await this.executeCommandOverSSH( {
				host: data.sshAuthentication.host,
				port: data.sshAuthentication.port,
				username: data.sshAuthentication.username,
				privateKey: data.sshAuthentication.privateKey,
				passphrase: data.sshAuthentication.passphrase,
				guid: data.command.guid,
				inputToken: data.inputToken,
			} );

			await this.track( 'success', { guid: data?.command.guid } );
		} catch ( err ) {
			if ( err instanceof NonZeroExitCodeError ) {
				await this.track( 'error', {
					guid: err.guid,
					error: 'non_zero_exit_code',
					message: `Command failed with exit code ${ err.exitCode }`,
					...extraTrackingInfo,
				} );

				process.exit( err.exitCode );
			} else if ( err instanceof APIError ) {
				console.error( `${ chalk.red( 'Error:' ) } ${ err.message }` );

				await this.track( 'error', {
					error: 'api_error',
					message: `API Error: ${ err.message }`,
					...extraTrackingInfo,
				} );

				process.exit( 1 );
			}
			const message = err instanceof Error ? err.message : String( err );

			console.error( `${ chalk.red( 'Error:' ) } ${ message }` );

			await this.track( 'error', {
				error: 'ssh_command_failed',
				message: `Error executing command over SSH: ${ message }`,
				...extraTrackingInfo,
			} );

			process.exit( 1 );
		}
	}

	private async executeCommandOverSSH( {
		host,
		port,
		username,
		privateKey,
		passphrase,
		guid,
		inputToken,
	}: {
		host: string;
		port: number;
		username: string;
		privateKey: string;
		passphrase: string;
		guid: string;
		inputToken: string;
	} ) {
		return new Promise< void >( ( resolve, reject ) => {
			const conn = new ssh2.Client();

			const columns = process.stdout.columns || NON_TTY_COLUMNS;
			const rows = process.stdout.rows || NON_TTY_ROWS;
			const isTTY = process.stdout.isTTY ? 'true' : 'false';

			let commandStarted = false;

			conn
				.on( 'ready', () => {
					conn.exec(
						`GUID=${ guid } INPUT_TOKEN=${ inputToken } VERSION=${ pkg.version } ROWS=${ rows } COLUMNS=${ columns } TTY=${ isTTY }`,
						( err, stream ) => {
							if ( err ) {
								reject( err );
								return;
							}

							stream.on( 'exit', ( exitCode: number ) => {
								if ( exitCode !== 0 ) {
									reject( new NonZeroExitCodeError( `Command failed`, guid, exitCode ) );
								}
							} );

							commandStarted = true;

							const handleSIGINT = () => {
								process.removeListener( 'SIGINT', handleSIGINT );
								console.log( 'SIGINT received. Canceling command...' );
								stream.end( '\x03' );
							};
							process.on( 'SIGINT', handleSIGINT );

							const handleSIGTERM = () => {
								process.removeListener( 'SIGTERM', handleSIGTERM );
								console.log( 'SIGTERM received. Canceling command...' );
								stream.end( '\x1F' );
							};
							process.on( 'SIGTERM', handleSIGTERM );

							stream.pipe( process.stdout );
							process.stdin.pipe( stream );

							stream.on( 'close', () => {
								process.removeListener( 'SIGINT', handleSIGINT );
								process.removeListener( 'SIGTERM', handleSIGTERM );

								conn.end();
								resolve();
							} );
						}
					);
				} )
				.on( 'error', err => {
					reject( err );
				} )
				.on( 'close', () => {
					if ( ! commandStarted ) {
						reject( new Error( 'Connection closed before command started' ) );
					}
				} )
				.connect( {
					host,
					port,
					username,
					privateKey,
					passphrase,
					readyTimeout: SSH_HANDSHAKE_TIMEOUT_MS,
				} );
		} );
	}

	private async getSSHAuthForCommand(
		command: string,
		extraTrackingInfo: Record< string, unknown > | undefined
	) {
		const api = API();

		try {
			return await api.mutate< TriggerWPCLICommandMutationResponse >( {
				mutation: TRIGGER_WP_CLI_COMMAND_MUTATION,
				variables: {
					input: {
						id: this.app.id,
						environmentId: this.env.id,
						command,
					},
				},
			} );
		} catch ( error ) {
			if ( CombinedGraphQLErrors.is( error ) ) {
				const message = error.errors.map( err => err.message ).join( '; ' );

				throw new APIError( message );
			}

			const message = error instanceof Error ? error.message : String( error );

			await this.track( 'error', {
				error: 'trigger_failed',
				message,
				...extraTrackingInfo,
			} );

			throw new Error( `Unable to trigger the WP-CLI command` );
		}
	}
}
