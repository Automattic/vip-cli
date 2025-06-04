#!/usr/bin/env node

import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import command from '../lib/cli/command';
import { formatData } from '../lib/cli/format';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../lib/constants/dev-environment';
import {
	getEnvironmentName,
	getEnvTrackingInfo,
	handleCLIException,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import {
	doesEnvironmentExist,
	getEnvironmentPath,
} from '../lib/dev-environment/dev-environment-core';
import { preparseEnvData } from '../lib/dev-environment/env-vars';
import { debug } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

const usage = 'vip dev-env envvar list';

const examples = [
	{
		usage: 'vip dev-env envvar list -s vip-local',
		description: 'List the names of all environment variables.',
	},
];

async function listEnvVarsCommand( args, opt ) {
	debug( 'args: %o, opt: %o', args, opt );

	const slug = await getEnvironmentName( opt );
	const trackingInfo = getEnvTrackingInfo( slug );

	const format = opt.format ?? 'table';

	const trackingPrefix = 'dev_env_envvar_list_command_';

	await trackEvent( `${ trackingPrefix }execute`, trackingInfo );

	try {
		const environmentPath = getEnvironmentPath( slug );
		if ( ! ( await doesEnvironmentExist( environmentPath ) ) ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		const data = await readFile( path.join( environmentPath, '.env' ), 'utf-8' );
		const envVars = preparseEnvData( data ).map( line => {
			const [ key ] = line.split( '=', 2 );
			return { name: key.trim() };
		} );

		if ( envVars.length === 0 ) {
			process.stderr.write( chalk.yellow( 'There are no environment variables\n' ) );
		} else {
			process.stdout.write( `${ formatData( envVars, format ) }\n` );
		}

		await trackEvent( `${ trackingPrefix }success`, trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, `${ trackingPrefix }error`, trackingInfo );
		process.exitCode = 1;
	}
}

command( {
	format: true,
	usage,
} )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.examples( examples )
	.argv( process.argv, listEnvVarsCommand );
