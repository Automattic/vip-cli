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
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { getEnvTrackingInfo } from '../lib/dev-environment/dev-environment-cli';

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
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const startProcessing = new Date();
		const slug = getEnvironmentName( opt );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_start_command_execute', trackingInfo );

		debug( 'Args: ', arg, 'Options: ', opt );

		const options = {
			skipRebuild: !! opt.skipRebuild,
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

			const processingTime = new Date() - startProcessing;
			const successTrackingInfo = Object.assign( {}, trackingInfo, { processingTime } );
			await trackEvent( 'dev_env_start_command_success', successTrackingInfo );
		} catch ( error ) {
			const errorTrackingInfo = Object.assign( {}, trackingInfo, { error: error.message } );
			await trackEvent( 'dev_env_start_command_error', errorTrackingInfo );
			handleCLIException( error );
		}
	} );
