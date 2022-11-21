#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';
import { exec } from 'child_process';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import { startEnvironment } from 'lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { getEnvTrackingInfo, validateDependencies, getEnvironmentName, handleCLIException } from '../lib/dev-environment/dev-environment-cli';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// PowerShell command for Windows Docker patch
const dockerWindowsPathCmd = 'wsl -d docker-desktop bash -c "sysctl -w vm.max_map_count=262144"';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } start`,
		description: 'Starts a local dev environment',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'skip-rebuild', 'Only start stopped services' )
	.option( [ 'w', 'skip-wp-versions-check' ], 'Skip prompting for wordpress update if non latest' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );
		await validateDependencies( slug );

		const startProcessing = new Date();

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_start_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		const options = {
			skipRebuild: !! opt.skipRebuild,
			skipWpVersionsCheck: !! opt.skipWpVersionsCheck,
		};
		try {
			if ( process.platform === 'win32' ) {
				debug( 'Windows platform detected. Applying Docker patch...' );

				exec( dockerWindowsPathCmd, { shell: 'powershell.exe' }, ( error, stdout ) => {
					if ( error != null ) {
						debug( error );
						console.log( `${ chalk.red( '✕' ) } There was an error while applying the Windows Docker patch.` );
					} else {
						debug( stdout );
						console.log( `${ chalk.green( '✓' ) } Docker patch for Windows applied.` );
					}
				} );
			}

			await startEnvironment( slug, options );

			const processingTime = Math.ceil( ( new Date() - startProcessing ) / 1000 ); // in seconds
			const successTrackingInfo = { ...trackingInfo, processing_time: processingTime };
			await trackEvent( 'dev_env_start_command_success', successTrackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_start_command_error', trackingInfo );
		}
	} );
