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
import { appQuery, getEnvVars } from '../lib/envvar/api';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

const usage = 'vip @mysite.develop config envvar get-all';

// Command examples
const examples = [
	{
		usage,
		description: 'Get the values of all environment variables',
	},
];

/**
 * @param {string[]} arg
 * @param {object} opt
 * @return {Promise<void>}
 */
export async function getAllEnvVarsCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		format: opt.format,
		org_id: opt.app.organization.id,
	};

	debug( `Request: Get all environment variables for ${ getEnvContext( opt.app, opt.env ) }` );
	await trackEvent( 'envvar_get_all_command_execute', trackingParams );

	const envvars = await getEnvVars( opt.app.id, opt.env.id ).catch( async err => {
		await trackEvent( 'envvar_get_all_query_error', { ...trackingParams, error: err.message } );

		throw err;
	} );

	await trackEvent( 'envvar_get_all_command_success', trackingParams );

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

	const envvarsObject = envvars.map( ( { name: envvarName, value } ) => ( {
		[ key ]: envvarName,
		value,
	} ) );

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
	.argv( process.argv, getAllEnvVarsCommand );
