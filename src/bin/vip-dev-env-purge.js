#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	getEnvTrackingInfo,
	handleCLIException,
	validateDependencies,
	promptForBoolean,
} from '../lib/dev-environment/dev-environment-cli';
import {
	destroyEnvironment,
	getAllEnvironmentNames,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } purge`,
		description: 'Destroys all local dev environments',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } purge --force`,
		description: 'Destroys all local dev environments without prompting',
	},
];

command()
	.option( 'soft', 'Keep config files needed to start an environment intact' )
	.option( 'force', 'Removes prompt that verifies if user wants to destroy all environments' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const allEnvNames = getAllEnvironmentNames();
		const lando = await bootstrapLando();
		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_purge_command_execute', trackingInfo );

		if ( allEnvNames.length === 0 ) {
			console.log( 'No environments to purge!' );
			return;
		}

		if ( ! opt.force ) {
			const purge = await promptForBoolean(
				'Are you sure you want to purge ALL existing dev environments?',
				true
			);

			if ( ! purge ) {
				return;
			}
		}

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
					// eslint-disable-next-line no-await-in-loop
					await handleCLIException( error, 'dev_env_destroy_command_error', trackingInfoChild );
					process.exitCode = 1;
				}
			}
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_purge_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
