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
