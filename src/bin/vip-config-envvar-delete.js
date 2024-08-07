#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, deleteEnvVar, validateNameWithMessage } from '../lib/envvar/api';
import { cancel, confirm, promptForValue } from '../lib/envvar/input';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip config envvar delete';
const exampleUsage = 'vip @example-app.develop config envvar delete';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description: 'Delete the environment variable "MY_VARIABLE" from the environment.',
	},
];

/**
 * @param {string[]} arg
 * @param {object} opt
 * @return {Promise<void>}
 */
export async function deleteEnvVarCommand( arg, opt ) {
	// Help the user by uppercasing input.
	const name = arg[ 0 ].trim().toUpperCase();

	const trackingParams = {
		app_id: opt.app.id,
		command: `${ baseUsage } ${ name }`,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		skip_confirm: Boolean( opt.skipConfirmation ),
		variable_name: name,
	};

	const envName = opt.env.type;
	const appName = opt.app.name;

	if ( ! opt.skipConfirmation && envName === 'production' ) {
		const yes = await confirm(
			`Are you sure you want to delete the environment variable ${ name } on ${ formatEnvironment(
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
		`Request: Delete environment variable ${ JSON.stringify( name ) } for ${ getEnvContext(
			opt.app,
			opt.env
		) }`
	);
	await trackEvent( 'envvar_delete_command_execute', trackingParams );

	if ( ! validateNameWithMessage( name ) ) {
		await trackEvent( 'envvar_delete_invalid_name', trackingParams );
		process.exit( 1 );
	}

	if ( ! opt.skipConfirmation ) {
		await promptForValue( `Type ${ name } to confirm deletion:`, name ).catch( async () => {
			await trackEvent( 'envvar_delete_user_cancelled_input', trackingParams );
			cancel();
		} );

		if ( ! ( await confirm( `Are you sure? ${ chalk.bold.red( 'Deletion is permanent' ) }` ) ) ) {
			await trackEvent( 'envvar_delete_user_cancelled_confirmation', trackingParams );
			cancel();
		}
	}

	await deleteEnvVar( opt.app.id, opt.env.id, name ).catch( async err => {
		await trackEvent( 'envvar_delete_mutation_error', { ...trackingParams, error: err.message } );

		throw err;
	} );

	await trackEvent( 'envvar_delete_command_success', trackingParams );
	console.log(
		chalk.green( `Successfully deleted environment variable ${ JSON.stringify( name ) }` )
	);

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
	.examples( examples )
	.option( 'skip-confirmation', 'Skip manual confirmation of input (USE WITH CAUTION)', false )
	.argv( process.argv, deleteEnvVarCommand );
