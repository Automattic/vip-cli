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
import { defaults, startEnvironment } from 'lib/dev-environment';
import { DEV_ENVIRONMENT_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: 'vip dev-environment start',
		description: 'Starts a local dev environment',
	},
];

command()
	.option( 'slug', `Custom name of the dev environment (default: "${ defaults.environmentSlug }")` )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = opt.slug || defaults.environmentSlug;

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			await startEnvironment( slug );
		} catch ( e ) {
			let messageToShow = chalk.red( 'Error:' );
			if ( 'Environment not found.' === e.message ) {
				const extraCommandParmas = opt.slug ? ` --slug ${ opt.slug }` : '';
				const createCommand = chalk.bold( DEV_ENVIRONMENT_COMMAND + ' create' + extraCommandParmas );

				messageToShow += `Environment doesnt exists\n\n\nTo create new environment run:\n\n${ createCommand }\n`;
				console.log( messageToShow );
			} else {
				console.log( messageToShow, e.message );
			}
		}
	} );
