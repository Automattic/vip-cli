#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import {
	getEnvironmentName,
	getEnvTrackingInfo,
	handleCLIException,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { readEnvFile, updateEnvFile } from '../lib/dev-environment/env-vars';
import { debug } from '../lib/envvar/logging';
import { trackEvent } from '../lib/tracker';

const exampleUsage = 'vip dev-env envvar delete --slug=example-site';
const usage = 'vip dev-env envvar delete';

const examples = [
	{
		usage: `${ exampleUsage } MY_VARIABLE`,
		description: 'Delete the environment variable "MY_VARIABLE" from the local environment.',
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
		let removed = false;
		const data = await readEnvFile( slug );
		const envVars = [];
		data.forEach( line => {
			const [ key ] = line.split( '=', 2 ).map( part => part.trim() );
			if ( key !== name ) {
				envVars.push( line );
			} else {
				removed = true;
			}
		} );

		if ( ! removed ) {
			const message = `The environment variable "${ name }" does not exist\n`;
			process.stderr.write( chalk.yellow( message ) );
			process.exitCode = 1;
		} else {
			const updatedData = envVars.join( '\n' );
			await updateEnvFile( slug, updatedData );

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
