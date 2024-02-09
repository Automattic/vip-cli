#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processSlug,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { stopEnvironment } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } stop`,
		description: 'Stops a local dev environment',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment', undefined, processSlug )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		debug( 'Args: ', arg, 'Options: ', opt );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_stop_command_execute', trackingInfo );

		try {
			await stopEnvironment( lando, slug );

			const message = chalk.green( '✓' ) + ' environment stopped.\n';
			console.log( message );

			await trackEvent( 'dev_env_stop_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_stop_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
