import chalk from 'chalk';

import app from '../lib/api/app';
import { BaseVIPCommand } from '../lib/base-command';
import { getEnvIdentifier } from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

import type { CommandUsage } from '../lib/types/commands';

export class AppCommand extends BaseVIPCommand {
	protected readonly name: string = 'app';

	protected readonly usage: CommandUsage = {
		description: 'List and modify your VIP applications',
		examples: [
			{
				description: 'Example 1',
				usage: 'vip app app',
			},
			{
				description: 'Example 2',
				usage: 'vip example ',
			},
		],
	};

	// protected readonly commandOptions: CommandOption[] = [];

	protected childCommands: BaseVIPCommand[] = [];

	protected async execute( ...arg: unknown[] ): void {
		console.log( arg[ 0 ] );
		let res;
		try {
			res = await app(
				arg[ 0 ],
				'id,repo,name,environments{id,appId,name,type,branch,currentCommit,primaryDomain{name},launched}'
			);
		} catch ( err ) {
			await trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		if ( ! res || ! res.environments ) {
			await trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		await trackEvent( 'app_command_success' );

		// Clone the read-only response object so we can modify it
		const clonedResponse = Object.assign( {}, res );

		const header = [
			{ key: 'id', value: res.id },
			{ key: 'name', value: res.name },
			{ key: 'repo', value: res.repo },
		];

		clonedResponse.environments = clonedResponse.environments.map( env => {
			const clonedEnv = Object.assign( {}, env );

			clonedEnv.name = getEnvIdentifier( env );

			// Use the short version of git commit hash
			clonedEnv.currentCommit = clonedEnv.currentCommit.substring( 0, 7 );

			// Flatten object
			clonedEnv.primaryDomain = clonedEnv.primaryDomain.name;
			delete clonedEnv.__typename;
			return clonedEnv;
		} );

		return { header, data: clonedResponse.environments };

		// console.log( formatData( header, 'keyValue' ) );

		// console.log( formatData( clonedResponse.environments, "table" ) );
	}
}
