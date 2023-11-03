#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import {
	destroyEnvironment,
	getAllEnvironmentNames,
} from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	getEnvTrackingInfo,
	handleCLIException,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } purge`,
		description: 'Destroys all local dev environments',
	},
];

command()
	.option( 'soft', 'Keep config files needed to start an environment intact' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const allEnvNames = getAllEnvironmentNames();
		const lando = await bootstrapLando();
		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_purge_command_execute', trackingInfo );

		try {
			for ( const envName of allEnvNames ) {
				const slug = envName;
				// eslint-disable-next-line no-await-in-loop
				await validateDependencies( lando, slug );
				const trackingInfoChild = getEnvTrackingInfo( slug );
				// eslint-disable-next-line no-await-in-loop
				await trackEvent( 'dev_env_destroy_command_execute', trackingInfoChild );

				debug( 'Args: ', arg, 'Options: ', opt );

				try {
					const removeFiles = ! ( opt.soft || false );
					// eslint-disable-next-line no-await-in-loop
					await destroyEnvironment( lando, slug, removeFiles );

					const message = chalk.green( '✓' ) + ' Environment destroyed.\n';
					console.log( message );
					// eslint-disable-next-line no-await-in-loop
					await trackEvent( 'dev_env_destroy_command_success', trackingInfoChild );
				} catch ( error ) {
					await handleCLIException( error, 'dev_env_destroy_command_error', trackingInfoChild );
					process.exitCode = 1;
				}
			}
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_purge_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
