// @flow

/**
 * External dependencies
 */
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
/* eslint-disable no-duplicate-imports */
import { keyValue } from './format';
import type { Tuple } from './format';
/* eslint-enable no-duplicate-imports */

export async function confirm( values: Array<Tuple>, message: string, skipPrompt: boolean = false ): Promise<boolean> {
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
