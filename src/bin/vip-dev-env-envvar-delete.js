#!/usr/bin/env node

import chalk from 'chalk';
import { readFile, rename, writeFile } from 'node:fs/promises';
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

const exampleUsage = 'vip dev-env envvar delete';
const usage = 'vip dev-env envvar delete -s vip-local';

const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description: 'Delete the environment variable "MY_VARIABLE" from the environment.',
	},
];

async function deleteEnvVarCommand( args, opt ) {
	debug( 'args: %o, opt: %o', args, opt );

	const slug = await getEnvironmentName( opt );
	const trackingInfo = getEnvTrackingInfo( slug );
	const name = args[ 0 ]?.trim() ?? '';

	const trackingPrefix = 'dev_env_envvar_delete_command_';

	await trackEvent( `${ trackingPrefix }execute`, trackingInfo );

	try {
		const environmentPath = getEnvironmentPath( slug );
		if ( ! ( await doesEnvironmentExist( environmentPath ) ) ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		const data = await readFile( path.join( environmentPath, '.env' ), 'utf-8' );
		const envVars = preparseEnvData( data ).map( line => {
			const [ key, value ] = line.split( '=', 2 ).map( part => part.trim() );
			return [ key, value ?? '' ];
		} );

		const index = envVars.findIndex( ( [ key ] ) => key === name );
		if ( index === -1 ) {
			const message = `The environment variable "${ name }" does not exist\n`;
			process.stderr.write( chalk.yellow( message ) );
			process.exitCode = 1;
		} else {
			envVars.splice( index, 1 );
			const updatedData = envVars.map( ( [ key, value ] ) => `${ key }=${ value }` ).join( '\n' );
			await writeFile( path.join( environmentPath, '.env.tmp' ), updatedData, 'utf-8' );
			await rename(
				path.join( environmentPath, '.env.tmp' ),
				path.join( environmentPath, '.env' )
			);

			process.stdout.write(
				chalk.green( `The variable "${ name }" has been successfully deleted.\n` )
			);
			process.stdout.write(
				chalk.bgYellow( chalk.bold( 'Important:' ) ) +
					' Please restart the environment for the changes to take effect.\n'
			);
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
	.argv( process.argv, deleteEnvVarCommand );
