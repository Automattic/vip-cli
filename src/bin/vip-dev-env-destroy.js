#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processSlug,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { destroyEnvironment } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env destroy';
const usage = 'vip dev-env destroy';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description:
			'Completely remove a local environment named "example-site" by removing all Docker containers, volumes, and configuration files.',
	},
	{
		usage: `${ exampleUsage } --soft --slug=example-site`,
		description:
			'Remove the Docker containers and volumes of a local environment named "example-site" but preserve the configuration files.\n' +
			'      * The preserved configuration files allow the local environment to be restarted with new Docker containers and volumes.',
	},
];

command( {
	usage,
} )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.option(
		'soft',
		'Preserve an environment’s configuration files; allows an environment to be regenerated with the start command.'
	)
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		validateDependencies( lando );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_destroy_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			const removeFiles = ! ( opt.soft || false );
			await destroyEnvironment( lando, slug, removeFiles );

			const message = chalk.green( '✓' ) + ' Environment destroyed.\n';
			console.log( message );
			await trackEvent( 'dev_env_destroy_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_destroy_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
