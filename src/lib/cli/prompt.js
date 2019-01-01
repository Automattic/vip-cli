// @flow

/**
 * External dependencies
 */
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import { formatEnvironment, keyValue, Tuple } from './format';

export async function confirm( values: Array<Tuple>, message: string ): Promise<boolean> {
	console.log( keyValue( values ) );

	const c = await prompt( {
		type: 'confirm',
		name: 'confirm',
		message: message,
		default: false,
	} );

	return c.confirm;
}
