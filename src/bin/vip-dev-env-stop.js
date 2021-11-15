#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { stopEnvironment } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } stop`,
		description: 'Stops a local dev environment',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			await stopEnvironment( slug );

			const message = chalk.green( '✓' ) + ' environment stopped.\n';
			console.log( message );
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
