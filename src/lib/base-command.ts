import debugLib from 'debug';
import { prompt } from 'enquirer';

import { formatData } from './cli/format';
import Token from './token';
import { trackEvent, aliasUser } from './tracker';

import type { CommandOption, CommandArgument, CommandUsage } from './types/commands';
// Needs to go inside the command
const debug = debugLib( '@automattic/vip:bin:vip' );
// Config
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

export abstract class BaseVIPCommand {
	protected name: string = 'vip';
	protected isDebugConfirmed: boolean = false;
	protected needsAuth: boolean = true;

	protected readonly commandOptions: CommandOption[] = [
		{
			name: 'app',
			description: 'Application id or slug',
			type: 'string',
			required: false,
		},
		{
			name: 'env',
			description: 'Application environment',
			type: 'string',
			required: false,
		},
	];

	protected readonly commandArguments: CommandArgument[] = [
		{
			name: 'app',
			description: 'Application id or slug',
			type: 'string',
			required: false,
		},
	];

	protected readonly usage: CommandUsage = {
		description: 'Base command',
		examples: [
			{
				description: 'Example 1',
				usage: 'vip example arg1 arg2',
			},
			{
				description: 'Example 2',
				usage: 'vip example --named=arg1 --also=arg2',
			},
		],
	};

	protected childCommands: BaseVIPCommand[] = [];

	public constructor() {}

	protected getTrackingParams( _args: Record< string, unknown > ): Record< string, unknown > {
		return {};
	}

	protected shouldTrackFailure( _error: Error ): boolean {
		return true;
	}

	/**
	 * Authentication routine.
	 * This will prompt the user to authenticate with their VIP account.
	 *
	 * @protected
	 * @returns {Promise< void >}
	 * @memberof BaseVIPCommand
	 */
	protected async authenticate(): Promise< void > {
		/**
		 * @param {any[]} argv
		 * @param {any[]} params
		 * @returns {boolean}
		 */
		function doesArgvHaveAtLeastOneParam( argv, params ) {
			return argv.some( arg => params.includes( arg ) );
		}

		let token = await Token.get();

		const isHelpCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'help', '-h', '--help' ] );
		const isVersionCommand = doesArgvHaveAtLeastOneParam( process.argv, [ '-v', '--version' ] );
		const isLogoutCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'logout' ] );
		const isLoginCommand = doesArgvHaveAtLeastOneParam( process.argv, [ 'login' ] );
		const isDevEnvCommandWithoutEnv =
			doesArgvHaveAtLeastOneParam( process.argv, [ 'dev-env' ] ) &&
			! containsAppEnvArgument( process.argv );

		debug( 'Argv:', process.argv );

		if (
			! isLoginCommand &&
			( isLogoutCommand ||
				isHelpCommand ||
				isVersionCommand ||
				isDevEnvCommandWithoutEnv ||
				token?.valid() )
		) {
			return;
		}

		console.log();
		console.log( '   _    __ ________         ________    ____' );
		console.log( '  | |  / //  _/ __        / ____/ /   /  _/' );
		console.log( '  | | / / / // /_/ /______/ /   / /    / /  ' );
		console.log( '  | |/ /_/ // ____//_____/ /___/ /____/ /   ' );
		console.log( '  |___//___/_/           ____/_____/___/   ' );
		console.log();

		console.log(
			'  VIP-CLI is your tool for interacting with and managing your VIP applications.'
		);
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

			return;
		}

		const { default: open } = await import( 'open' );

		await open( tokenURL, { wait: false } );

		await trackEvent( 'login_command_browser_opened' );

		const { token: tokenInput } = await prompt( {
			type: 'password',
			name: 'token',
			message: 'Access Token:',
		} );

		try {
			token = new Token( tokenInput );
		} catch ( err ) {
			console.log( 'The token provided is malformed. Please check the token and try again.' );

			await trackEvent( 'login_command_token_submit_error', { error: err.message } );

			return;
		}

		if ( token.expired() ) {
			console.log( 'The token provided is expired. Please log in again to refresh the token.' );

			await trackEvent( 'login_command_token_submit_error', { error: 'expired' } );

			return;
		}

		if ( ! token.valid() ) {
			console.log( 'The provided token is not valid. Please log in again to refresh the token.' );

			await trackEvent( 'login_command_token_submit_error', { error: 'invalid' } );

			return;
		}

		try {
			await Token.set( token.raw );
		} catch ( err ) {
			await trackEvent( 'login_command_token_submit_error', {
				error: err.message,
			} );

			throw err;
		}

		// De-anonymize user for tracking
		await aliasUser( token.id );

		await trackEvent( 'login_command_token_submit_success' );

		if ( isLoginCommand ) {
			console.log( 'You are now logged in - see `vip -h` for a list of available commands.' );

			process.exit();
		}
	}

	// args length can vary based the number of arguments and options the command defines, the command itsrlf is always the last argument
	// Can some of this logic be moved out to a hook?

	/**
	 * This is a wrapper method that performs common routines before and after executing the command
	 *
	 * @param {...unknown[]} args
	 * @returns {Promise< void >}
	 * @memberof BaseVIPCommand
	 */
	public async run( ...args: unknown[] ): Promise< void > {
		if ( this.needsAuth ) {
			try {
				await this.authenticate();
			} catch ( error ) {
				console.log( error );
			}
		}

		let res;
		// Invoke the command and send tracking information
		const trackingParams = this.getTrackingParams( { args } );
		// console.log( args );
		// let [ _args, opts, command ] = args;
		const command = args[ args.length - 1 ];
		const _opts = command.opts();
		// console.log( command.opts() );

		if ( _opts?.inspect && ! this.isDebugConfirmed ) {
			await prompt( {
				type: 'confirm',
				name: 'confirm',
				message: "Attach the debugger, once you see 'Debugger attached' above hit 'y' to continue",
			} );
			this.isDebugConfirmed = true;
		}

		try {
			await trackEvent( `${ this.name }_execute`, trackingParams );
			res = await this.execute( ...args );

			if ( _opts.format && res ) {
				if ( res.header ) {
					if ( _opts.format !== 'json' ) {
						console.log( formatData( res.header, 'keyValue' ) );
					}
					res = res.data;
				}

				res = res.map( row => {
					const out = { ...row };
					if ( out.__typename ) {
						// Apollo injects __typename
						delete out.__typename;
					}

					return out;
				} );

				await trackEvent( 'command_output', {
					format: _opts.format,
				} );

				const formattedOut = formatData( res, _opts.format );

				console.log( formattedOut );

				return {};
			}
			await trackEvent( `${ this.name }_success`, trackingParams );
		} catch ( error ) {
			const err =
				error instanceof Error ? error : new Error( error?.toString() ?? 'Unknown error' );

			if ( this.shouldTrackFailure( err ) ) {
				await trackEvent( `${ this.name }_error`, {
					...trackingParams,
					failure: err.message,
					stack: err.stack,
				} );
			}

			throw error;
		}
	}

	protected abstract execute( ..._args: unknown[] ): void;

	public getName(): string {
		return this.name;
	}

	public getUsage(): CommandUsage {
		return this.usage;
	}

	public getChildCommands(): BaseVIPCommand[] {
		return this.childCommands;
	}

	public getOptions(): CommandOption[] {
		return this.commandOptions;
	}

	public getArguments(): CommandArgument[] {
		return this.commandArguments;
	}
}
