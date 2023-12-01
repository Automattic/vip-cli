export interface CommandExample {
	description: string;
	usage: string;
}

export interface CommandUsage {
	description: string;
	examples: CommandExample[];
}

/**
 * Base Command from which every subcommand should inherit.
 *
 * @class BaseCommand
 */
export abstract class BaseCommand {
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
}

/**
 * The registry that stores/invokes all the commands.
 *
 * The main entry point will call it.
 *
 * @class CommandRegistry
 */
class CommandRegistry {
	private static instance: CommandRegistry;
	private readonly commands: Map< string, BaseCommand >;

	private constructor() {
		this.commands = new Map< string, BaseCommand >();
	}

	public static getInstance(): CommandRegistry {
		if ( ! CommandRegistry.instance ) {
			CommandRegistry.instance = new CommandRegistry();
		}
		return CommandRegistry.instance;
	}

	public registerCommand( command: BaseCommand ): void {
		this.commands.set( command.getName(), command );
	}

	public invokeCommand( commandName: string, ...args: unknown[] ): void {
		const command = this.commands.get( commandName );
		if ( command ) {
			command.run( ...args );
		} else {
			throw new Error( `Command '${ commandName }' not found.` );
		}
	}

	public getCommands(): Map< string, BaseCommand > {
		return this.commands;
	}
}

class ExampleCommand extends BaseCommand {
	constructor() {
		super( 'example' );
	}

	protected execute( ...args: unknown[] ): void {
		console.log( this.getName(), args );
	}
}

const registry = CommandRegistry.getInstance();
registry.registerCommand( new ExampleCommand() );

for ( const [ key, command ] of registry.getCommands() ) {
	console.log( `${ key }`, command.getUsage() );
}

registry.invokeCommand( 'example', 'arg1', 'arg2', { named: 'arg' } );
