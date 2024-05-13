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
import {
	printEnvironmentInfo,
	printAllEnvironmentsInfo,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env info';
const usage = 'vip dev-env info';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Retrieve basic information about the local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --slug=example-site --extended`,
		description: 'Retrieve a larger amount of information about the local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --all`,
		description: 'Retrieve basic information about all local environments.',
	},
];

command( {
	usage,
})
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'all', 'Retrieve information about all local environments.' )
	.option( 'extended', 'Retrieve a larger amount of information.' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		let trackingInfo;
		let slug;
		const lando = await bootstrapLando();

		if ( opt.all ) {
			trackingInfo = { all: true };
			slug = '';
		} else {
			slug = await getEnvironmentName( opt );
			trackingInfo = getEnvTrackingInfo( slug );
		}

		await validateDependencies( lando, slug );
		await trackEvent( 'dev_env_info_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			const options = {
				extended: Boolean( opt.extended ),
				suppressWarnings: true,
			};
			if ( opt.all ) {
				await printAllEnvironmentsInfo( lando, options );
			} else {
				await printEnvironmentInfo( lando, slug, options );
			}
			await trackEvent( 'dev_env_info_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_info_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
