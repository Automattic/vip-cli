/**
 * External dependencies
 */
import chalk from 'chalk';
import { BooleanPrompt, prompt } from 'enquirer';

/**
 * Internal dependencies
 */

export function cancel() {
	console.log( chalk.yellow( 'Command cancelled by user.' ) );
	process.exit();
}

export function confirm( message ) {
	return new BooleanPrompt( { message } ).run().catch( () => false );
}

export async function promptForValue( message, mustMatch ) {
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
