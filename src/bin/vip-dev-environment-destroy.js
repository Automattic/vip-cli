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
import { defaults, destroyEnvironment } from 'lib/dev-environment';
import { DEV_ENVIRONMENT_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_COMMAND } destroy`,
		description: 'Destroys a default local dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_COMMAND } destroy --slug foo`,
		description: 'Destroys a local dev environment named foo',
	},
];

command()
	.option( 'slug', `Custom name of the dev environment (default: "${ defaults.environmentSlug }")` )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = opt.slug || defaults.environmentSlug;

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			await destroyEnvironment( slug );

			const message = chalk.green( '✓' ) + ' environment destroyed.\n';
			console.log( message );
		} catch ( e ) {
			console.log( chalk.red( 'Error:' ), e.message );
		}
	} );
