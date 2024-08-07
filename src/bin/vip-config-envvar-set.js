#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, setEnvVar, validateNameWithMessage } from '../lib/envvar/api';
import { cancel, confirm, promptForValue } from '../lib/envvar/input';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { readVariableFromFile } from '../lib/envvar/read-file';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip config envvar set';
const exampleUsage = 'vip @example-app.develop config envvar set';

const NEW_RELIC_ENVVAR_KEY = 'NEW_RELIC_LICENSE_KEY';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description:
			'Add or update the environment variable "MY_VARIABLE" and assign its value at the prompt.',
	},
	{
		usage: `${ exampleUsage } MULTILINE_ENV_VAR --from-file=envvar-value.txt`,
		description:
			'Add or update the environment variable "MULTILINE_ENV_VAR" and assign the multiline contents of local file envvar-value.txt as its value.',
	},
];

export async function setEnvVarCommand( arg, opt ) {
	// Help the user by uppercasing input.
	const name = arg[ 0 ].trim().toUpperCase();

	const trackingParams = {
		app_id: opt.app.id,
		command: `${ baseUsage } ${ name }`,
		env_id: opt.env.id,
		from_file: Boolean( opt.fromFile ),
		org_id: opt.app.organization.id,
		skip_confirm: Boolean( opt.skipConfirmation ),
		variable_name: name,
	};

	const envName = opt.env.type;
	const appName = opt.app.name;

	if ( ! opt.skipConfirmation && envName === 'production' ) {
		const yes = await confirm(
			`Are you sure you want to set the environment variable ${ name } on ${ formatEnvironment(
				envName
			) } for site ${ appName }?`
		);

		if ( ! yes ) {
			trackEvent( 'wpcli_confirm_cancel', trackingParams ).catch( () => {} );

			console.log( 'Command cancelled' );
			process.exit();
		}
	}

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
			'If you want to set your own New Relic key, please contact WordPress VIP support.'
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

		if ( ! ( await confirm( `Please ${ chalk.bold( 'confirm' ) } the input value above` ) ) ) {
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
