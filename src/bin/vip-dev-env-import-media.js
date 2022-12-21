#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from '../lib/cli/command';
import { getEnvironmentName, getEnvTrackingInfo, handleCLIException, validateDependencies } from '../lib/dev-environment/dev-environment-cli';
import { importMediaPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media path/to/wp-content/uploads`,
		description: 'Import contents of the given WP uploads folder file into the media library of the default dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media path/to/wp-content/uploads --slug=mysite`,
		description: 'Import contents of the given WP uploads folder file into the media library of a dev environment named `mysite`',
	},
];

command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.option( 'slug', 'Custom name of the dev environment' )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		const [ filePath ] = unmatchedArgs;
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_import_media_command_execute', trackingInfo );

		try {
			await importMediaPath( slug, filePath );
			await trackEvent( 'dev_env_import_media_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_import_media_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
