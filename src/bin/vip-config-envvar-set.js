#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { appQuery, setEnvVar, validateNameWithMessage } from '../lib/envvar/api';
import { cancel, confirm, promptForValue } from '../lib/envvar/input';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { readVariableFromFile } from '../lib/envvar/read-file';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip @mysite.develop config envvar set';

const NEW_RELIC_ENVVAR_KEY = 'NEW_RELIC_LICENSE_KEY';

// Command examples
const examples = [
	{
		usage: `${ baseUsage } MY_VARIABLE`,
		description: 'Sets the environment variable "MY_VARIABLE" and prompts for its value',
	},
];

export async function setEnvVarCommand( arg, opt ) {
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

	debug(
		`Request: Set environment variable ${ JSON.stringify( name ) } for ${ getEnvContext(
			opt.app,
			opt.env
		) }`
	);
	await trackEvent( 'envvar_set_command_execute', trackingParams );

	if ( ! validateNameWithMessage( name ) ) {
		await trackEvent( 'envvar_set_invalid_name', trackingParams );
		process.exit( 1 );
	}

	if ( NEW_RELIC_ENVVAR_KEY === name ) {
		await trackEvent( 'envvar_set_newrelic_key', trackingParams );
		console.log(
			chalk.bold.red( 'Setting the New Relic key is not permitted.' ),
			'If you want to set your own New Relic key, please contact our support team through the usual channels.'
		);
		process.exit( 1 );
	}

	let value;
	if ( opt.fromFile ) {
		value = await readVariableFromFile( opt.fromFile );
	} else {
		console.log( `For multiline input, use the ${ chalk.bold( '--from-file' ) } option.` );
		console.log();
		value = await promptForValue( `Enter the value for ${ name }:` ).catch( async () => {
			await trackEvent( 'envvar_set_user_cancelled_input', trackingParams );
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

		if (
			! ( await confirm( `Please ${ chalk.bold( 'confirm' ) } the input value above (y/N)` ) )
		) {
			await trackEvent( 'envvar_set_user_cancelled_confirmation', trackingParams );
			cancel();
		}
	}

	await setEnvVar( opt.app.id, opt.env.id, name, value ).catch( async err => {
		await trackEvent( 'envvar_set_mutation_error', { ...trackingParams, error: err.message } );

		throw err;
	} );

	await trackEvent( 'envvar_set_command_success', trackingParams );
	console.log( chalk.green( `Successfully set environment variable ${ JSON.stringify( name ) }` ) );

	if ( ! opt.skipConfirmation ) {
		console.log(
			chalk.bgYellow( chalk.bold( 'Important:' ) ),
			'Updates to environment variables will not be available until the application’s next deploy.'
		);
	}
}

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
	.argv( process.argv, setEnvVarCommand );
