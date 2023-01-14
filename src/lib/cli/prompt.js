// @flow

/**
 * External dependencies
 */
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import { keyValue, type Tuple } from './format';

export async function confirm( values: Array<Tuple>, message: string, skipPrompt: boolean = false ): Promise<boolean> {
	console.log( keyValue( values ) );

	if ( ! skipPrompt ) {
		const answer = await prompt( {
			type: 'confirm',
			name: 'confirm',
			message,
			default: false,
		} );
		return answer.confirm;
	}

	return true;
}
