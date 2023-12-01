export abstract class BaseVIPCommand {
	protected readonly commandOptions: CommandOption[] = [
		{
			name: '--debug',
			alias: '-d',
			description: 'Show debug',
			type: 'boolean',
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

	constructor( private readonly name: string ) {}

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

	protected abstract execute( ...args: unknown[] ): void;

	public getName(): string {
		return this.name;
	}

	public getUsage(): CommandUsage {
		return this.usage;
	}

	public getOptions(): CommandOption[] {
		return this.commandOptions;
	}
}
