#!/usr/bin/env node

import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processSlug,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { showLogs } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env logs';
const usage = 'vip dev-env logs';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Retrieve logs for all running services of the local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --service=elasticsearch --slug=example-site`,
		description:
			'Retrieve logs only for the "elasticsearch" service of the local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --service=database --follow --slug=example-site`,
		description:
			'Retrieve and continually output logs for the "database" service of the local environment named "example-site".',
	},
];

command( {
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( [ 'f', 'follow' ], 'Continually output logs as they are generated.' )
	.option( 'service', 'Restrict to a single service.' )
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
