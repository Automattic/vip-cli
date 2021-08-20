#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import path from 'path';
import { exec } from 'child_process';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { startEnvironment } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const dockerEsPatchPath = path.join( __dirname, '..', '..', '..', 'assets', 'docker-es-patch.ps1' );

// Command examples
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
		const slug = getEnvironmentName( opt );

		debug( 'Args: ', arg, 'Options: ', opt );

		const options = {
			skipRebuild: !! opt.skipRebuild,
		};
		try {
			if ( process.platform === 'win32' ) {
				console.log( 'Running on Windows. Applying Docker patch...' );

				exec( dockerEsPatchPath, { shell: 'powershell.exe' }, ( error, stdout, stderr ) => {
					if ( error != null ) {
					  console.log( 'There was an error while applying the patch: ' );
					  console.log( error );
					  return;
					}

					console.log( 'Docker patch for Windows applied' );
				} );
			}

			await startEnvironment( slug, options );
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
