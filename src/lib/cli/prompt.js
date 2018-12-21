// @flow

/**
 * External dependencies
 */
import inquirer from 'inquirer';

/**
 * Internal dependencies
 */
import { formatEnvironmeznt, keyValue, Tuple } from './format';

export async function confirm( values: Array<Tuple>, message: string ): Promise<boolean> {
	console.log( keyValue( values ) );

	const c = await inquirer.prompt( {
		type: 'confirm',
		name: 'confirm',
		message: message,
		prefix: '',
		default: false,
	} );

	return c.confirm;
}
