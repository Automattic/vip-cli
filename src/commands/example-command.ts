import { BaseVIPCommand } from '../lib/base-command';
import { CommandExample, CommandOption, CommandArgument, CommandUsage } from './types/commands';
import { CommandRegistry } from '../lib/command-registry';

const registry = CommandRegistry.getInstance();

export class ExampleCommand extends BaseVIPCommand {
	protected readonly name: string = 'example';
	protected readonly usage: CommandUsage = {
		description: 'Example command',
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

	protected readonly commandOptions: CommandOption[] = [
		{
			name: '--slug <slug>, -s <slug>',
			description: 'An env slug',
			type: 'string',
			required: true,
		},
	];

	protected childCommands: BaseVIPCommand[] = [ new ExampleChildCommand() ];

	constructor( name ) {
		super( 'example' );
	}

	protected execute( opts, ...args: unknown[] ): void {
		console.log( 'parent', this.getName(), opts, args );
	}
}

export class ExampleChildCommand extends BaseVIPCommand {
	protected readonly name: string = 'child';
	protected readonly usage: CommandUsage = {
		description: 'Example child command',
		examples: [
			{
				description: 'Example 1',
				usage: 'vip example child arg1 arg2',
			},
			{
				description: 'Example 2',
				usage: 'vip example child --named=arg1 --also=arg2',
			},
		],
	};

	protected execute( opts, ...args: unknown[] ): void {
		console.log( this.getName(), 'what' );
	}
	// constructor() {
	// 	super( 'example child' );
	// }
}


// registry.registerCommand( new ExampleCommand() );
