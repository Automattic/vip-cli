#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { startEnvironment } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

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
			await startEnvironment( slug, options );
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
