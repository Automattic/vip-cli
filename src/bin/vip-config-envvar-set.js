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
import { appQuery, setEnvVar, validateNameWithMessage } from 'lib/envvar/api';
import { cancel, confirm, promptForValue } from 'lib/envvar/input';
import { debug, getEnvContext } from 'lib/envvar/logging';
import { readVariableFromFile } from 'lib/envvar/read-file';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';

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

		const trackingParams = {
			app_id: opt.app.id,
			command: `${ baseUsage } ${ name }`,
			env_id: opt.env.id,
			from_file: !! opt.fromFile,
			org_id: opt.app.organization.id,
			skip_confirm: !! opt.skipConfirmation,
			variable_name: name,
		};

		debug( `Request: Set environment variable ${ JSON.stringify( name ) } for ${ getEnvContext( opt.app, opt.env ) }` );
		await trackEvent( 'envvars_set_command_execute', trackingParams );

		if ( ! validateNameWithMessage( name ) ) {
			await trackEvent( 'envvars_set_invalid_name', trackingParams );
			process.exit();
		}

		let value;
		if ( opt.fromFile ) {
			value = await readVariableFromFile( opt.fromFile );
		} else {
			console.log( `For multiline input, use the ${ chalk.bold( '--from-file' ) } option.` );
			console.log();
			value = await promptForValue( `Enter the value for ${ name }:` )
				.catch( async () => {
					await trackEvent( 'envvars_set_user_cancelled_input', trackingParams );
					cancel();
				} );
		}

		if ( ! opt.skipConfirmation ) {
			// Print input if it was loaded from file.
			if ( opt.fromFile ) {
				console.log( '===== Received value printed below =====' );
				console.log( value );
				console.log( '===== Received value printed above =====' );
				console.log();
			}

			if ( ! await confirm( `Please ${ chalk.bold( 'confirm' ) } the input value above (y/N)` ) ) {
				await trackEvent( 'envvars_set_user_cancelled_confirmation', trackingParams );
				cancel();
			}
		}

		await setEnvVar( opt.app.id, opt.env.id, name, value )
			.catch( async err => {
				rollbar.error( err );
				await trackEvent( 'envvars_set_mutation_error', { ...trackingParams, error: err.message } );

				throw err;
			} );

		await trackEvent( 'envvars_set_command_success', trackingParams );
		console.log( chalk.green( `Successfully set environment variable ${ JSON.stringify( name ) }` ) );
	} );
