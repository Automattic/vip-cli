#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { showLogs } from '../lib/dev-environment/dev-environment-core';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } logs --slug=my_site`,
		description: 'Return all logs from a local dev environment named "my_site"',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } logs --slug=my_site --service=elasticsearch`,
		description:
			'Return logs from the "elasticsearch" service from a local dev environment named "my_site"',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } logs --slug=my_site --service=elasticsearch -f`,
		description:
			'Follow logs from the "elasticsearch" service from a local dev environment named "my_site"',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( [ 'f', 'follow' ], 'Follow logs for a specific service in local dev environment' )
	.option(
		'service',
		'Show logs for a specific service in local dev environment. Defaults to all if none passed in.'
	)
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_logs_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		if ( ! opt.follow ) {
			opt.follow = false;
		}

		if ( ! opt.service ) {
			opt.service = false;
		}

		const options = {
			follow: opt.follow,
			service: opt.service,
			timestamps: true,
		};

		try {
			await showLogs( lando, slug, options );
			await trackEvent( 'dev_env_logs_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_logs_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
