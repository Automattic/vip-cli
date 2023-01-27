#!/usr/bin/env node

// @flow
// @format

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { getEnvTrackingInfo, validateDependencies, getEnvironmentName, handleCLIException } from '../lib/dev-environment/dev-environment-cli';
import { bootstrapLando, landoShell } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } shell`,
		description: 'Spawns a shell in the dev environment',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'root', 'Spawn a root shell' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, '' );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_shell_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		const isRoot = !! opt.root;
		try {
			await landoShell( lando, getEnvironmentPath( slug ), 'php', isRoot ? 'root' : 'www-data' );
			await trackEvent( 'dev_env_shell_command_success', trackingInfo );
		} catch ( error ) {
			if ( ! error.hide ) {
				await handleCLIException( error, 'dev_env_shell_command_error', trackingInfo );
				process.exitCode = 1;
			} else {
				await trackEvent( 'dev_env_shell_command_success', trackingInfo );
			}
		}
	} );
