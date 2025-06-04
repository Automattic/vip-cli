#!/usr/bin/env node

import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import command from '../lib/cli/command';
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

const exampleUsage = 'vip dev-env envvar get';
const usage = 'vip dev-env envvar get -s vip-local';

const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description: 'Retrieve the value of the environment variable "MY_VARIABLE".',
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
		const environmentPath = getEnvironmentPath( slug );
		if ( ! ( await doesEnvironmentExist( environmentPath ) ) ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		const data = await readFile( path.join( environmentPath, '.env' ), 'utf-8' );
		const envVar = preparseEnvData( data )
			.map( line => line.split( '=', 2 ) )
			.find( ( [ key ] ) => name === key );

		if ( undefined === envVar ) {
			const message = `The environment variable "${ name }" does not exist\n`;
			process.stderr.write( chalk.yellow( message ) );
			process.exitCode = 1;
		} else {
			process.stdout.write( `${ envVar[ 1 ] }\n` );
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
