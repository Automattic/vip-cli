import { Command } from 'commander';

import { BaseVIPCommand } from './base-command';
import { CommandRegistry } from './command-registry';
import { ExampleCommand } from '../commands/example-command';
import { CommandExample, CommandOption, CommandArgument, CommandUsage } from './types/commands';

/**
 * Base Command from which every subcommand should inherit.
 *
 * @class BaseCommand
 */

const makeVIPCommand = ( command: BaseVIPCommand ): Command => {
	const usage = command.getUsage();
	const options = command.getOptions();
	const name = command.getName();
	const commandArgs = command.getArguments();
	const cmd = new Command( name ).description( usage.description );

	for( const argument of commandArgs ) {
		let name = argument.name;
		if ( argument.required ) {
			name = `<${ name }>`;
		} else {
			name = `[${ name }]`;
		}

		cmd.argument( name, argument.description );
	}

	for ( const option of options ) {
		cmd.option( option.name, option.description );
	}


	cmd.action( ( ...args ) => {
		console.log( name );
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
	for ( const childCommand of command.getChildCommands() ) {
		// const instance: BaseVIPCommand = new childCommand();
		program.addCommand( makeVIPCommand( childCommand ) );
	}
}
program.parse( process.argv );
