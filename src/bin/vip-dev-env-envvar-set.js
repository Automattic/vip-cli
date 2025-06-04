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
import { quoteEnvValue, preparseEnvData } from '../lib/dev-environment/env-vars';
import { validateNameWithMessage } from '../lib/envvar/api';
import { cancel, promptForValue } from '../lib/envvar/input';
import { debug } from '../lib/envvar/logging';
import { readVariableFromFile } from '../lib/envvar/read-file';
import { trackEvent } from '../lib/tracker';

const exampleUsage = 'vip dev-env envvar set';
const usage = 'vip dev-env envvar set -s vip-local';

const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description:
			'Add or update the environment variable "MY_VARIABLE" and assign its value at the prompt.',
	},
	{
		usage: `${ exampleUsage } MY_VARIABLE MY_VALUE`,
		description:
			'Add or update the environment variable "MY_VARIABLE" and assign its value to "MY_VALUE".',
	},
	{
		usage: `${ exampleUsage } MULTILINE_ENV_VAR --from-file=envvar-value.txt`,
		description:
			'Add or update the environment variable "MULTILINE_ENV_VAR" and assign the multiline contents of local file envvar-value.txt as its value.',
	},
];

async function deleteEnvVarCommand( args, opt ) {
	debug( 'args: %o, opt: %o', args, opt );

	const slug = await getEnvironmentName( opt );
	const trackingInfo = getEnvTrackingInfo( slug );
	const name = args[ 0 ]?.trim() ?? '';
	let newValue = args[ 1 ];

	const trackingPrefix = 'dev_env_envvar_set_command_';

	await trackEvent( `${ trackingPrefix }execute`, trackingInfo );
	if ( ! validateNameWithMessage( name ) ) {
		await trackEvent( 'dev_env_envvar_set_invalid_name', trackingInfo );
		process.exit( 1 );
	}

	try {
		const environmentPath = getEnvironmentPath( slug );
		if ( ! ( await doesEnvironmentExist( environmentPath ) ) ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		if ( newValue === undefined ) {
			if ( opt.fromFile ) {
				newValue = await readVariableFromFile( opt.fromFile );
			} else {
				process.stdout.write(
					`For multiline input, please use the ${ chalk.bold( '--from-file' ) } option.\n\n`
				);
				newValue = await promptForValue( `Enter the value for ${ name }:` ).catch( async () => {
					await trackEvent( 'dev_env_envvar_set_user_cancelled_input', trackingInfo );
					cancel();
				} );
			}
		}

		newValue = quoteEnvValue( newValue );
		let replaced = false;

		const data = await readFile( path.join( environmentPath, '.env' ), 'utf-8' );
		const envVars = preparseEnvData( data ).map( line => {
			const [ key ] = line.split( '=', 2 ).map( part => part.trim() );
			if ( key === name ) {
				replaced = true;
				return `${ key }=${ newValue }`;
			}

			return line;
		} );

		if ( ! replaced ) {
			envVars.push( `${ name }=${ newValue }` );
		}

		const updatedData = envVars.join( '\n' );
		await writeFile( path.join( environmentPath, '.env.tmp' ), updatedData, 'utf-8' );
		await rename( path.join( environmentPath, '.env.tmp' ), path.join( environmentPath, '.env' ) );

		process.stdout.write(
			chalk.green( `The variable "${ name }" has been successfully updated.\n` )
		);
		process.stdout.write(
			chalk.bgYellow( chalk.bold( 'Important:' ) ) +
				' Please restart the environment for the changes to take effect.\n'
		);

		await trackEvent( `${ trackingPrefix }success`, trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, `${ trackingPrefix }error`, trackingInfo );
		process.exitCode = 1;
	}
}

command( {
	requiredArgs: 1,
	wildcardCommand: true,
	usage,
} )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.option(
		'from-file',
		'Read environment variable value from a UTF-8-encoded text file (useful for multiline input). Accepts a relative or absolute path.'
	)
	.examples( examples )
	.argv( process.argv, deleteEnvVarCommand );
