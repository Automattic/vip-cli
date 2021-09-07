/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import { BooleanPrompt, prompt } from 'enquirer';

/**
 * Internal dependencies
 */

export function cancel(): void {
	console.log( chalk.yellow( 'Command cancelled by user.' ) );
	process.exit();
}

export function confirm( message: string ): Promise<boolean> {
	return new BooleanPrompt( { message } ).run().catch( () => false );
}

export async function promptForValue( message: string, mustMatch?: string ): Promise<string> {
	const response = await prompt( {
		message,
		name: 'str',
		type: 'input',
		validate: input => {
			if ( mustMatch && input !== mustMatch ) {
				return `Please type ${ mustMatch } to proceed or ESC to cancel`;
			}

			return true;
		},
	} );

	return response.str?.trim() || '';
}
