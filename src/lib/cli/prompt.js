/**
 * External dependencies
 */
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
/* eslint-disable no-duplicate-imports */
import { keyValue } from './format';
/* eslint-enable no-duplicate-imports */

export async function confirm( values, message, skipPrompt = false ) {
	console.log( keyValue( values ) );

	if ( ! skipPrompt ) {
		const answer = await prompt( {
			type: 'confirm',
			name: 'confirm',
			message: message,
			default: false,
		} );
		return answer.confirm;
	}

	return true;
}
