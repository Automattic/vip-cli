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
import { appQuery, setEnvVar, validateNameOrError } from 'lib/envvar/api';
import { confirmOrCancel, printBox, promptForValue } from 'lib/envvar/input';
import { debug } from 'lib/envvar/logging';
import { readVariableFromFile } from 'lib/envvar/read-file';

const baseUsage = 'vip config envvar set';

// Command examples
const examples = [
	{
		usage: `${ baseUsage } MY_VARIABLE`,
		description: 'Sets the environment variable "MY_VARIABLE" and prompts for its value',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage: `${ baseUsage } <VARIABLE_NAME>`,
} )
	.option( 'from-file', 'Read environment variable value from file (useful for multiline input)' )
	.option( 'skip-confirmation', 'Skip manual confirmation of input (USE WITH CAUTION)', false )
	.examples( examples )
	.argv( process.argv, async ( arg: string[], opt ) => {
		// Help the user by uppercasing input.
		const name = arg[ 0 ].trim().toUpperCase();

		debug( `Request: Set environment variable ${ JSON.stringify( name ) } for @${ opt.app.id }.${ opt.env.type }` );

		validateNameOrError( name );

		let value;
		if ( opt.fromFile ) {
			value = await readVariableFromFile( opt.fromFile );
		} else {
			console.log( `For multiline input, use the ${ chalk.bold( '--from-file' ) } option.` );
			console.log();
			value = await promptForValue( `Enter the value for ${ name }:` );
		}

		if ( ! opt.skipConfirmation ) {
			// Print input if it was loaded from file.
			if ( opt.fromFile ) {
				printBox( [ 'Received value printed below' ] );
				console.log( value );
				printBox( [ 'Received value printed above' ] );
				console.log();
			}

			await confirmOrCancel( `Please ${ chalk.bold( 'confirm' ) } the input value above (y/N)` );
		}

		await setEnvVar( opt.app.id, opt.env.id, name, value );
		console.log( chalk.green( `Successfully set environment variable ${ JSON.stringify( name ) }` ) );
	} );
