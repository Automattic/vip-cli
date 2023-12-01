import { BaseVIPCommand } from '../lib/base-command';

export class ExampleCommand extends BaseVIPCommand {
	protected readonly commandOptions: CommandOption[] = [
		{
			name: '--slug <slug>, -s <slug>',
			description: 'An env slug',
			type: 'string',
		},
	];

	constructor() {
		super( 'example' );
	}

	protected execute( opts, ...args: unknown[] ): void {
		console.log( this.getName(), opts, args );
	}
}
