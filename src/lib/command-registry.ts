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

	public async invokeCommand( commandName: string, ...args: unknown[] ): Promise< void > {
		const command = this.commands.get( commandName );
		if ( command ) {
			await command.run( ...args );
		} else {
			console.log( this.commands );
			throw new Error( `Command '${ commandName }' not found.` );
		}
	}

	public getCommands(): Map< string, BaseVIPCommand > {
		return this.commands;
	}
}
