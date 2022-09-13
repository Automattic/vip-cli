#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import { stopEnvironment } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { validateDependencies, getEnvTrackingInfo } from '../lib/dev-environment/dev-environment-cli';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } stop`,
		description: 'Stops a local dev environment',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		await validateDependencies();
		const slug = getEnvironmentName( opt );

		debug( 'Args: ', arg, 'Options: ', opt );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_stop_command_execute', trackingInfo );

		try {
			await stopEnvironment( slug );

			const message = chalk.green( '✓' ) + ' environment stopped.\n';
			console.log( message );

			await trackEvent( 'dev_env_stop_command_success', trackingInfo );
		} catch ( error ) {
			handleCLIException( error, 'dev_env_stop_command_error', trackingInfo );
		}
	} );
