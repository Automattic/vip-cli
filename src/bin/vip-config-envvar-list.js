#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { formatData } from '../lib/cli/format';
import { appQuery, listEnvVars } from '../lib/envvar/api';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

const usage = 'vip @mysite.develop config envvar list';

// Command examples
const examples = [
	{
		usage,
		description: 'Lists all environment variables (names only)',
	},
];

/**
 * @param {string[]} arg
 * @param {object} opt
 * @return {Promise<void>}
 */
export async function listEnvVarsCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		format: opt.format,
		org_id: opt.app.organization.id,
	};

	debug( `Request: list environment variables for ${ getEnvContext( opt.app, opt.env ) }` );
	await trackEvent( 'envvar_list_command_execute', trackingParams );

	const envvars = await listEnvVars( opt.app.id, opt.env.id ).catch( async err => {
		await trackEvent( 'envvar_list_query_error', { ...trackingParams, error: err.message } );

		throw err;
	} );

	await trackEvent( 'envvar_list_command_success', trackingParams );

	if ( 0 === envvars.length ) {
		console.log( chalk.yellow( 'There are no environment variables' ) );
		process.exit();
	}

	// Vary data by expected format.
	let key = 'name';
	if ( 'keyValue' === opt.format ) {
		key = 'key';
	} else if ( 'ids' === opt.format ) {
		key = 'id';
	}

	// Format as an object for formatData.
	const envvarsObject = envvars.map( name => ( { [ key ]: name } ) );

	console.log( formatData( envvarsObject, opt.format ) );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	usage,
} )
	.examples( examples )
	.argv( process.argv, listEnvVarsCommand );
