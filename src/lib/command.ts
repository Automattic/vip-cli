import { Command } from 'commander';

import { BaseVIPCommand } from './base-command';
import { parseEnvAliasFromArgv } from './cli/envAlias';
import { CommandRegistry } from './command-registry';
import { description, version } from '../../package.json';
import { AppCommand } from '../commands/app';
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

/**
 * @param {string[]} args
 * @param {Command} command
 * @returns {string[]}
 */
function sortArguments( args, command ) {
	const subcommands = command.commands.map( cmd => cmd.name() );
	if ( subcommands.length ) {
		const saved = [];
		while ( args.length ) {
			const arg = /** @type {string} */ args.shift();
			if ( arg === '--' ) {
				return [ ...saved, arg, ...args ];
			}

			if ( subcommands.includes( arg ) ) {
				return [
					arg,
					...sortArguments(
						[ ...saved, ...args ],
						/** @type {Command} */ command.commands.find( cmd => cmd.name() === arg )
					),
				];
			}

			saved.push( arg );
		}

		return [ ...saved ];
	}

	return args;
}

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

const { argv, ...appAlias } = parseEnvAliasFromArgv( process.argv );

// let appAliasString = Object.values( appAlias ).filter( e => e ).join( '.' );
// if ( appAliasString ) {
// 	argv.push( `@${ appAliasString }` );
// }
// console.log(appAlias);
console.log( argv, sortArguments( process.argv.slice( 2 ), program ), { appAlias }, [
	...argv.slice( 0, 2 ),
	...sortArguments( process.argv.slice( 2 ), program ),
] );
// program.parse( sortArguments(process.argv, program ), { appAlias } );
program.parse( [ ...argv.slice( 0, 2 ), ...sortArguments( process.argv.slice( 2 ), program ) ], {
	appAlias,
} );
