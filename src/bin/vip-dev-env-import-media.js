#!/usr/bin/env node

import command from '../lib/cli/command';
import {
	getEnvironmentName,
	getEnvTrackingInfo,
	handleCLIException,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { importMediaPath } from '../lib/dev-environment/dev-environment-core';
import { trackEvent } from '../lib/tracker';

const exampleUsage = 'vip dev-env import media';
const usage = 'vip dev-env import media';

const examples = [
	{
		usage: `${ exampleUsage } /Users/example/Desktop/uploads --slug="example-site"`,
		description:
			'Import the contents of the "uploads" directory from a path on the user\'s local machine to the "/wp-content/uploads" directory of the local environment named "example-site".',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.examples( examples )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const [ filePath ] = unmatchedArgs;
		const slug = await getEnvironmentName( opt );

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
