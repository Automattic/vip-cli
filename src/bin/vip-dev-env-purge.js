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
const exampleUsage = 'vip dev-env purge';
const usage = 'vip dev-env purge';

const examples = [
	{
		usage: `${ exampleUsage }`,
		description: 'Destroy all local environments.',
	},
	{
		usage: `${ exampleUsage } --force`,
		description: 'Destroy all local environments without requiring confirmation from the user.',
	},
	{
		usage: `${ exampleUsage } --soft`,
		description: 'Remove the Docker containers and volumes of all local environments but preserve their configuration files.\n' +
		'      * Preserving the configuration files allows the local environments to be restarted; new Docker containers and volumes will be generated.',
	},
];

command( {
	usage,
})
	.option( 'soft', 'Preserve an environment\’s configuration files; allows an environment to be regenerated with the start command.' )
	.option( 'force', 'Skip confirmation.' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		debug( 'Args: ', arg, 'Options: ', opt );

		const allEnvNames = getAllEnvironmentNames();
		const lando = await bootstrapLando();

		if ( allEnvNames.length === 0 ) {
			console.log( 'No environments to purge!' );
			return;
		}

		if ( ! opt.force ) {
			const purge = await promptForBoolean(
				'Are you sure you want to purge ALL existing local environments?',
				true
			);

			if ( ! purge ) {
				return;
			}
		}

		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_purge_command_execute', trackingInfo );
		await validateDependencies( lando, '' );
		const removeFiles = ! ( opt.soft || false );

		try {
			for ( const slug of allEnvNames ) {
				try {
					// eslint-disable-next-line no-await-in-loop
					await destroyEnvironment( lando, slug, removeFiles );

					const message = chalk.green( '✓' ) + ' Environments purged.\n';
					console.log( message );
				} catch ( error ) {
					const trackingInfoChild = getEnvTrackingInfo( slug );
					// eslint-disable-next-line no-await-in-loop
					await handleCLIException( error, 'dev_env_purge_command_error', trackingInfoChild );
					process.exitCode = 1;
				}
			}
			await trackEvent( 'dev_env_purge_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_purge_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
