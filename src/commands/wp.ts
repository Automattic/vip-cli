/**
 * External dependencies
 */
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

const getSSHAuthForCommand = async ( appId: number, envId: number, command: string ) => {
	const api = API();

	return api.mutate( {
		mutation: TRIGGER_WP_CLI_COMMAND_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				command,
			},
		},
	} ) as Promise< { data: TriggerWPCLICommandMutationResponse } >;
};

export class WPCliCommandOverSSH {
	private app: App;
	private env: AppEnvironment;
	private track: CommandTracker;

	constructor( app: App, env: AppEnvironment ) {
		this.app = app;
		this.env = env;

		this.track = makeCommandTracker( 'wp', {
			app: this.app.id,
			env: this.env.id,
			executionType: 'ssh',
		} );
	}

	public async run( command: string ): Promise< void > {
		if ( ! this.app.id || ! this.env.id ) {
			console.error( 'No app ID or environment ID provided' );

			await this.track( 'error', {
				error: 'no_app_env_id',
				message: 'No app or env ID provided',
			} );
			return;
		}

		debug( "Requesting SSH authentication for command '%s'", command );

		const sshAuth = await getSSHAuthForCommand( this.app.id, this.env.id, command );

		const data = sshAuth.data?.triggerWPCLICommandOnAppEnvironment;

		debug( 'Connecting to SSH' );

		try {
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
			console.log( err );
			await this.track( 'error', {
				guid: data?.command.guid,
				error: 'ssh_command_failed',
				message: 'Error executing command over SSH',
			} );
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
		return new Promise( ( resolve, reject ) => {
			const conn = new ssh2.Client();

			conn
				.on( 'ready', () => {
					conn.exec(
						`GUID=${ guid } INPUT_TOKEN=${ inputToken } VERSION=${ pkg.version }`,
						( err, stream ) => {
							if ( err ) throw err;

							// OpenSSH does not implement the method of signal passing,
							// so we need to handle SIGINT and SIGTERM manually
							// https://github.com/mscdex/ssh2/issues/165#issuecomment-51422980
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
								conn.end();
								resolve( '' );
							} );
						}
					);
				} )
				.on( 'error', err => {
					reject( err );
				} )
				.connect( {
					host,
					port,
					username,
					privateKey,
					passphrase,
				} );
		} );
	}
}
