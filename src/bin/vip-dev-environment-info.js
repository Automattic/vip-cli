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
import { defaults, printEnvironmentInfo, printAllEnvironmentsInfo, handleCLIException } from 'lib/dev-environment';
import { DEV_ENVIRONMENT_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_COMMAND } info`,
		description: 'Return information about a local dev environment',
	},
];

command()
	.option( 'slug', `Custom name of the dev environment (default: "${ defaults.environmentSlug }")` )
	.option( 'all', 'Show Info for all local dev environemnts' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = opt.slug || defaults.environmentSlug;

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			if ( opt.all ) {
				await printAllEnvironmentsInfo();
			} else {
				await printEnvironmentInfo( slug );
			}
		} catch ( e ) {
			handleCLIException( e, opt.slug );
		}
	} );
