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
import { stopEnvironment } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env stop';
const usage = 'vip dev-env stop';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Stop a local environment named "example-site".',
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
