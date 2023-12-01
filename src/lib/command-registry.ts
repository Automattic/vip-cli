/**
 * The registry that stores/invokes all the commands.
 *
 * The main entry point will call it.
 *
 * @class CommandRegistry
 */
import { BaseVIPCommand } from './base-command';

export class CommandRegistry {
	private static instance: CommandRegistry;
	private readonly commands: Map< string, BaseVIPCommand >;

	private constructor() {
		this.commands = new Map< string, BaseVIPCommand >();
	}

	public static getInstance(): CommandRegistry {
		if ( ! CommandRegistry.instance ) {
			CommandRegistry.instance = new CommandRegistry();
		}
		return CommandRegistry.instance;
	}

	public registerCommand( command: BaseVIPCommand ): void {
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

	public getCommands(): Map< string, BaseVIPCommand > {
		return this.commands;
	}
}
