#!/usr/bin/env node

/**
 * @flow
 * @fomat
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
import * as exit from 'lib/cli/exit';
import { destroyEnvironment } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } destroy`,
		description: 'Destroys a default local dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } destroy --slug foo`,
		description: 'Destroys a local dev environment named foo',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			await destroyEnvironment( slug );

			const message = chalk.green( '✓' ) + ' environment destroyed.\n';
			console.log( message );
		} catch ( e ) {
			exit.withError( e.message );
		}
	} );
