import chalk from 'chalk';

import command from '../lib/cli/command';
import { formatData } from '../lib/cli/format';
import { appQuery, listEnvVars } from '../lib/envvar/api';
import { debug, getEnvContext } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

import type { AppEnvOptions } from './vip-config';
import type { OutputFormat } from '../lib/cli/format';

const usage = 'vip config envvar list';
const exampleUsage = 'vip @example-app.develop config envvar list';

// Command examples
const examples = [
	{
		usage: exampleUsage,
		description: 'List the names of all environment variables on an environment.',
	},
];

/**
 * @param {string[]} arg
 * @param {object} opt
 * @return {Promise<void>}
 */
export async function listEnvVarsCommand( arg: string[], opt: AppEnvOptions ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		format: opt.format,
		org_id: opt.app.organization.id,
		org_sfid: opt.app.organization.salesforceId,
	};

	debug( `Request: list environment variables for ${ getEnvContext( opt.app, opt.env ) }` );
	await trackEvent( 'envvar_list_command_execute', trackingParams );

	const envvars = await listEnvVars( opt.app.id, opt.env.id ).catch( async ( err: unknown ) => {
		await trackEvent( 'envvar_list_query_error', {
			...trackingParams,
			error: ( err as Error ).message,
		} );

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

	console.log( formatData( envvarsObject, opt.format as OutputFormat ) );
}

export default command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	usage,
} )
	.examples( examples )
	.argv( process.argv, listEnvVarsCommand );
