/**
 * External dependencies
 */
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import { keyValue, type Tuple } from './format';

interface Answer {
	confirm: boolean;
}

export async function confirm(
	values: Tuple[],
	message: string,
	skipPrompt: boolean = false
): Promise< boolean > {
	console.log( keyValue( values ) );

	if ( ! skipPrompt ) {
		const answer = await prompt< Answer >( {
			type: 'confirm',
			name: 'confirm',
			message,
		} );

		return answer.confirm;
	}

	return true;
}
