import { CommandRegistry } from './command-registry';

import type { CommandOption, CommandArgument, CommandUsage } from './types/commands';

export class BaseVIPCommand {
	protected name: string = 'vip';

	protected readonly commandOptions: CommandOption[] = [
		{
			name: '--debug',
			alias: '-d',
			description: 'Show debug',
			type: 'boolean',
		},
	];

	protected readonly commandArguments: CommandArgument[] = [
		{
			name: 'app',
			description: 'Application id or slug',
			type: 'string',
			required: true,
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

	public constructor() {
		const registry = CommandRegistry.getInstance();
		// registry.registerCommand( this );

		this.childCommands.forEach( command => {
			registry.registerCommand( command );
		} );
	}

	protected trackEvent( eventName: string, data: unknown[] ): void {
		// Send tracking information to trackEvent
	}

	public run( ...args: unknown[] ): void {
		// Invoke the command and send tracking information
		try {
			this.trackEvent( `${ this.name }_execute`, args );
			this.execute( ...args );
			this.trackEvent( `${ this.name }_success`, args );
		} catch ( error ) {
			const err =
				error instanceof Error ? error : new Error( error?.toString() ?? 'Unknown error' );

			this.trackEvent( `${ this.name }_error`, [ err ] );
			throw error;
		}
	}

	protected execute( ..._args: unknown[] ): void {
		// Do nothing
	}

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
