import { BaseVIPCommand } from '../lib/base-command';

import type { CommandOption, CommandUsage } from '../lib/types/commands';

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

	protected execute( opts: unknown[], ...args: unknown[] ): void {
		console.log( 'parent', this.getName(), opts );
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

	protected childCommands: BaseVIPCommand[] = [ new ExampleGrandChildCommand() ];

	protected execute( opts: unknown[], ...args: unknown[] ): void {
		console.log( this.getName() );
	}
}

export class ExampleGrandChildCommand extends BaseVIPCommand {
	protected readonly name: string = 'grandchild';
	protected readonly usage: CommandUsage = {
		description: 'Example grandchild command',
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

	protected execute( opts: unknown[], ...args: unknown[] ): void {
		console.log( this.getName() );
	}
}
