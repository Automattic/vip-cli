import { Command } from 'commander';

import { BaseVIPCommand } from './base-command';
import { CommandRegistry } from './command-registry';
import { description, version } from '../../package.json';
import { ExampleCommand } from '../commands/example-command';
import { AppCommand } from '../commands/app';
import { parse } from 'args';
import { parseEnvAliasFromArgv } from './cli/envAlias';

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

	cmd.option( '-d, --debug [component]', 'Show debug' ).option( '--inspect', 'Attach a debugger' );

	cmd.action( async ( ...args: unknown[] ) => {
		await registry.invokeCommand( name, ...args );
	} );

	cmd.configureHelp( { showGlobalOptions: true } );
	return cmd;
};

const processCommand = ( parent: Command, command: BaseVIPCommand ): void => {
	const cmd = makeVIPCommand( command );

	command.getChildCommands().forEach( childCommand => {
		registry.registerCommand( childCommand );
		processCommand( cmd, childCommand );
	} );
	parent.addCommand( cmd );
};

const program = new Command();

program
	.name( 'vip' )
	.description( description )
	.version( version )
	.configureHelp( { showGlobalOptions: true } );

const registry = CommandRegistry.getInstance();
registry.registerCommand( new ExampleCommand() );
registry.registerCommand( new AppCommand() );

[ ...registry.getCommands().values() ].map( command => processCommand( program, command ) );

let { argv, ...appAlias } = parseEnvAliasFromArgv( process.argv );

let appAliasString = Object.values( appAlias ).filter( e => e ).join( '.' );
if ( appAliasString ) {
	argv.push( `@${ appAliasString }` );
}
console.log(appAlias);
program.parse( argv, appAlias );
