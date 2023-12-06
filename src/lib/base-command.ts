import { CommandRegistry } from './command-registry';
import { trackEvent } from './tracker';

import type { CommandOption, CommandArgument, CommandUsage } from './types/commands';

export abstract class BaseVIPCommand {
	protected name: string = 'vip';

	protected readonly commandOptions: CommandOption[] = [];

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

	public constructor() {}

	protected getTrackingParams( _args: Record< string, unknown > ): Record< string, unknown > {
		return {};
	}

	protected shouldTrackFailure( _error: Error ): boolean {
		return true;
	}

	public async run( ...args: unknown[] ): Promise< void > {
		// Invoke the command and send tracking information
		const trackingParams = this.getTrackingParams( { args } );
		try {
			await trackEvent( `${ this.name }_execute`, trackingParams );
			this.execute( ...args );
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
