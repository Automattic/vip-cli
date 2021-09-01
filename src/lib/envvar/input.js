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

export function cancel() {
	console.log( chalk.yellow( 'Command cancelled by user.' ) );
	process.exit();
}

export async function confirmOrCancel( message: string ): Promise<void> {
	const confirmed = await new BooleanPrompt( { message } )
		.run()
		.catch( cancel );

	if ( ! confirmed ) {
		cancel();
	}
}

export function printBox( lines: string[] ): void {
	const longestLineLength = lines.reduce( ( acc, line ) => line.length > acc ? line.length : acc, 0 );

	const bar = '─'.repeat( longestLineLength + 2 );

	const box = [
		`┌${ bar }┐`,
		...lines.map( line => `│ ${ line }${ ' '.repeat( longestLineLength - line.length ) } │` ),
		`└${ bar }┘`,
	];

	console.log( chalk.green( box.join( '\n' ) ) );
}

export async function promptForValue( message: string, mustMatch?: string ) {
	const response = await prompt( {
		message,
		name: 'str',
		type: 'input',
		validate: input => {
			if ( mustMatch && input !== mustMatch ) {
				return `Please type ${ mustMatch } or ESC to cancel`;
			}

			return true;
		},
	} ).catch( cancel );

	return response.str?.trim() || '';
}
