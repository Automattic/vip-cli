import chalk from 'chalk';
import { Confirm, prompt } from 'enquirer';

import { isAppNodejs } from '../app';

export function cancel(): void {
	console.log( chalk.yellow( 'Command cancelled by user.' ) );
	process.exit();
}

export function confirm( message: string ): Promise< boolean > {
	return new Confirm( { message } ).run().catch( () => false );
}

interface Answer {
	// FIXME: can it really be undefined?
	str?: string;
}

export async function promptForValue( message: string, mustMatch?: string ): Promise< string > {
	const { str } = await prompt< Answer >( {
		message,
		name: 'str',
		type: 'input',
		validate: ( input: string ) => {
			if ( mustMatch && input !== mustMatch ) {
				return `Please type ${ mustMatch } to proceed or ESC to cancel`;
			}

			return true;
		},
	} );

	return str?.trim() ?? '';
}

/**
 * Prompts the user to confirm whether to apply the environment variable update now.
 *
 * @param {number} appTypeId - The application type ID
 * @return {Promise<boolean>} Whether to reload the manifest
 */
export async function promptForReloadManifest( appTypeId: number ): Promise< boolean > {
	if ( isAppNodejs( appTypeId ) ) {
		console.log(
			chalk.yellow(
				`⚠️ Note: ${ chalk.bold(
					'Only applies to runtime variable changes.'
				) } Build-time environment variable changes won't take effect until your next deploy.`
			)
		);
	}

	return await confirm( 'Apply this environment variable update now?' );
}

/**
 * Shows a warning message that the environment variable update won't be available until the next deploy.
 */
export function showDeployWarning(): void {
	console.log(
		chalk.bgYellow( chalk.bold( 'Important:' ) ),
		'This environment variable update will not be available until the next code deploy is made to this environment.'
	);
}
