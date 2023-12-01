import { Command } from 'commander';

import { BaseVIPCommand } from './base-command';
import { CommandRegistry } from './command-registry';
import { ExampleCommand } from '../commands/example-command';
export interface CommandExample {
	description: string;
	usage: string;
}

export interface CommandUsage {
	description: string;
	examples: CommandExample[];
}

export interface CommandOption {
	name: string;
	alias?: string;
	description: string;
	type: 'string' | 'number' | 'boolean';
	required?: boolean;
}

export interface CommandArgument {
	name: string;
	description: string;
	type: 'string' | 'number' | 'boolean';
	required?: boolean;
}
/**
 * Base Command from which every subcommand should inherit.
 *
 * @class BaseCommand
 */




const makeVIPCommand = ( command: BaseVIPCommand ): Command => {
	const usage = command.getUsage();
	const options = command.getOptions();
	const name = command.getName();
	const cmd = new Command( name ).description( usage.description );
	for ( const option of options ) {
		cmd.option( option.name, option.description );
	}

	cmd.action( ( ...args ) => {
		registry.invokeCommand( name, ...args );
	} );
	cmd.configureHelp( { showGlobalOptions: true } )
	return cmd;
};

const program = new Command();

const baseVIPCommand = new BaseVIPCommand( 'vip' );

program
	.name( 'vip' )
	.description( 'WPVIP CLI' )
	.version( '3.0.0' )
	.configureHelp( { showGlobalOptions: true } );

for ( const option of baseVIPCommand.getOptions() ) {
	program.option( option.name, option.description );
}

const registry = CommandRegistry.getInstance();
registry.registerCommand( new ExampleCommand() );

for ( const [ key, command ] of registry.getCommands() ) {
	program.addCommand( makeVIPCommand( command ) );
}
program.parse( process.argv );
