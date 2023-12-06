import { Command } from 'commander';

import { BaseVIPCommand } from './base-command';
import { CommandRegistry } from './command-registry';
import { ExampleCommand } from '../commands/example-command';

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

	for ( const argument of commandArgs ) {
		let argumentName = argument.name;
		if ( argument.required ) {
			argumentName = `<${ argumentName }>`;
		} else {
			argumentName = `[${ argumentName }]`;
		}

		cmd.argument( argumentName, argument.description );
	}

	for ( const option of options ) {
		cmd.option( option.name, option.description );
	}

	cmd.action( ( ...args: unknown[] ) => {
		console.log( name );
		registry.invokeCommand( name, ...args );
	} );
	cmd.configureHelp( { showGlobalOptions: true } );
	return cmd;
};

const program = new Command();

const baseVIPCommand = new BaseVIPCommand();

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
	const cmd = makeVIPCommand( command );
	for ( const childCommand of command.getChildCommands() ) {
		// const instance: BaseVIPCommand = new childCommand();
		cmd.addCommand( makeVIPCommand( childCommand ) );
	}

	program.addCommand( cmd );
}
program.parse( process.argv );
