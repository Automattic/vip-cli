#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import {
	getEnvironmentName,
	getEnvTrackingInfo,
	handleCLIException,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { parseEnvValue, readEnvFile } from '../lib/dev-environment/env-vars';
import { debug } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';
import { splitKeyValueString } from '../lib/utils';

const exampleUsage = 'vip dev-env envvar get --slug=example-site';
const usage = 'vip dev-env envvar get';

const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description: 'Retrieve the value of the local environment variable "MY_VARIABLE".',
	},
];

async function getEnvVarsCommand( args, opt ) {
	debug( 'args: %o, opt: %o', args, opt );

	const slug = await getEnvironmentName( opt );
	const trackingInfo = getEnvTrackingInfo( slug );

	const name = args[ 0 ]?.trim() ?? '';

	const trackingPrefix = 'dev_env_envvar_get_command_';

	await trackEvent( `${ trackingPrefix }execute`, trackingInfo );

	try {
		const data = await readEnvFile( slug );
		const envVar = data
			.map( line => splitKeyValueString( line ) )
			.find( ( [ key ] ) => name === key.trim() );

		if ( undefined === envVar ) {
			process.stderr.write(
				chalk.yellow( `The environment variable "${ name }" does not exist\n` )
			);
			process.exitCode = 1;
		} else {
			const value = parseEnvValue( envVar[ 1 ] );
			process.stdout.write( `${ value }\n` );
		}

		await trackEvent( `${ trackingPrefix }success`, trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, `${ trackingPrefix }error`, trackingInfo );
		process.exitCode = 1;
	}
}

command( {
	requiredArgs: 1,
	usage,
} )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.examples( examples )
	.argv( process.argv, getEnvVarsCommand );
