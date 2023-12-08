import args from 'args';
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';

import { parseEnvAliasFromArgv } from '../lib/cli/envAlias';
import { CommandRegistry } from './command-registry';
import { trackEvent } from './tracker';

import type { CommandOption, CommandArgument, CommandUsage } from './types/commands';
import { Command } from 'commander';

export abstract class BaseVIPCommand {
	protected name: string = 'vip';
	protected isDebugConfirmed: boolean = false;

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

	// args length can vary based the number of arguments and options the command defines, the command itsrlf is always the last argument
	// Can some of this logic be moved out to a hook?
	public async run( ...args: unknown[] ): Promise< void > {
		let ret;
		// Invoke the command and send tracking information
		const trackingParams = this.getTrackingParams( { args } );
		// console.log( args );
		// let [ _args, opts, command ] = args;
		let command = args[ args.length - 1 ];
		console.log( command.opts() );

		if ( command.opts()?.inspect && ! this.isDebugConfirmed ) {
			await prompt( {
				type: 'confirm',
				name: 'confirm',
				message: "Attach the debugger, once you see 'Debugger attached' above hit 'y' to continue",
			} );
			this.isDebugConfirmed = true;
		}

		try {
			await trackEvent( `${ this.name }_execute`, trackingParams );
			ret = await this.execute( ...args );
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
