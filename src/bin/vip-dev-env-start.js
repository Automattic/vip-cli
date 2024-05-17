#!/usr/bin/env node

import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	validateDependencies,
	getEnvironmentName,
	handleCLIException,
	postStart,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { startEnvironment } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env start';
const usage = 'vip dev-env start';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Start a local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --skip-wp-versions-check --slug=example-site`,
		description:
			'Skip the prompt to upgrade WordPress to the latest release version and start a local environment with the less recent version of WordPress currently configured.',
	},
	{
		usage: `${ exampleUsage } --skip-rebuild --slug=example-site`,
		description:
			'Start only the services of a local environment that are not currently in a running state.',
	},
	{
		usage: `${ exampleUsage } --vscode --slug=example-site`,
		description:
			'Start a local environment and generate a Workspace file for developing in Visual Studio Code.',
	},
];

command( {
	usage,
})
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'skip-rebuild', 'Only start services that are not in a running state.' )
	.option(
		[ 'w', 'skip-wp-versions-check' ],
		'Skip the prompt to update WordPress; occurs if the last major release version is not configured.'
	)
	.option( 'vscode', 'Generate a Visual Studio Code Workspace file.' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = await getEnvironmentName( opt );
		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		const startProcessing = new Date();

		const versions = await lando.engine.daemon.getVersions();
		const trackingInfo = getEnvTrackingInfo( slug );
		trackingInfo.vscode = Boolean( opt.vscode );
		trackingInfo.docker = versions.engine;
		trackingInfo.docker_compose = versions.compose;

		await trackEvent( 'dev_env_start_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		const options = {
			skipRebuild: Boolean( opt.skipRebuild ),
			skipWpVersionsCheck: Boolean( opt.skipWpVersionsCheck ),
		};
		try {
			await startEnvironment( lando, slug, options );

			const processingTime = Math.ceil( ( new Date() - startProcessing ) / 1000 ); // in seconds
			const successTrackingInfo = { ...trackingInfo, processing_time: processingTime };
			await trackEvent( 'dev_env_start_command_success', successTrackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_start_command_error', trackingInfo );
			process.exitCode = 1;
		}

		postStart( slug, { openVSCode: Boolean( opt.vscode ) } );
	} );
