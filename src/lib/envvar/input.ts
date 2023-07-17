// @format

/**
 * External dependencies
 */
import chalk from 'chalk';
import { Confirm, prompt } from 'enquirer';

/**
 * Internal dependencies
 */

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
