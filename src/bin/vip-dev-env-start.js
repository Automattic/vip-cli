#!/usr/bin/env node

import debugLib from 'debug';

import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
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

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } start`,
		description: 'Starts a local dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } start --vscode`,
		description:
			'Start a local environment and generate a Workspace file for developing in Visual Studio Code',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment', undefined, processSlug )
	.option( 'skip-rebuild', 'Only start stopped services' )
	.option(
		[ 'w', 'skip-wp-versions-check' ],
		'Skip prompt to update WordPress version if not on latest'
	)
	.option( 'vscode', 'Generate a Visual Studio Code Workspace file' )
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
