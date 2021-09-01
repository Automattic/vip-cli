#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { appQuery, deleteEnvVar, validateNameOrError } from 'lib/envvar/api';
import { confirmOrCancel, promptForValue } from 'lib/envvar/input';
import { debug } from 'lib/envvar/logging';

const baseUsage = 'vip config envvar delete';

// Command examples
const examples = [
	{
		usage: `${ baseUsage } MY_VARIABLE`,
		description: 'Permanently deletes the environment variable "MY_VARIABLE"',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage: `${ baseUsage } <VARIABLE_NAME>`,
} )
	.examples( examples )
	.option( 'skip-confirmation', 'Skip manual confirmation of input (USE WITH CAUTION)', false )
	.argv( process.argv, async ( arg: string[], opt ) => {
		// Help the user by uppercasing input.
		const name = arg[ 0 ].trim().toUpperCase();

		debug( `Request: delete environment variable ${ JSON.stringify( name ) } for @${ opt.app.id }.${ opt.env.type }` );

		validateNameOrError( name );
		await promptForValue( `Type ${ name } to confirm deletion:`, name );
		await confirmOrCancel( `Are you sure? ${ chalk.bold.red( 'Deletion is permanent' ) } (y/N)` );

		await deleteEnvVar( opt.app.id, opt.env.id, name );
		console.log( chalk.green( `Successfully deleted environment variable ${ JSON.stringify( name ) }` ) );
	} );
