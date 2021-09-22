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
import { appQuery, getEnvVar } from 'lib/envvar/api';
import { debug, getEnvContext } from 'lib/envvar/logging';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';

const baseUsage = 'vip config envvar get';

// Command examples
const examples = [
	{
		usage: `${ baseUsage } MY_VARIABLE`,
		description: 'Get the value of the environment variable "MY_VARIABLE"',
	},
];

export async function getEnvVarCommand( arg: string[], opt ): void {
	// Help the user by uppercasing input.
	const name = arg[ 0 ].trim().toUpperCase();

	const trackingParams = {
		app_id: opt.app.id,
		command: `${ baseUsage } ${ name }`,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		variable_name: name,
	};

	debug( `Request: Get environment variable ${ JSON.stringify( name ) } for ${ getEnvContext( opt.app, opt.env ) }` );
	await trackEvent( 'envvar_get_command_execute', trackingParams );

	const envvar = await getEnvVar( opt.app.id, opt.env.id, name )
		.catch( async err => {
			rollbar.error( err );
			await trackEvent( 'envvar_get_query_error', { ...trackingParams, error: err.message } );

			throw err;
		} );

	await trackEvent( 'envvar_get_command_success', trackingParams );

	if ( ! envvar ) {
		const message = `The environment variable ${ JSON.stringify( name ) } does not exist`;
		console.log( chalk.yellow( message ) );
		process.exit();
	}

	console.log( envvar.value );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage: `${ baseUsage } <VARIABLE_NAME>`,
} )
	.examples( examples )
	.argv( process.argv, getEnvVarCommand );

