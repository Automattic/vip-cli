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
import {
	printEnvironmentInfo,
	printAllEnvironmentsInfo,
} from '../lib/dev-environment/dev-environment-core';
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
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } info --all`,
		description: 'Return information about all local dev environments',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } info --slug=my_site`,
		description: 'Return information about a local dev environment named "my_site"',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'all', 'Show Info for all local dev environments' )
	.option( 'extended', 'Show extended information about the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		const trackingInfo = opt.all ? { all: true } : getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_info_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			const options = {
				extended: !! opt.extended,
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
