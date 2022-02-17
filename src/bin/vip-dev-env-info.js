#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { printEnvironmentInfo, printAllEnvironmentsInfo } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_SUBCOMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } info --all`,
		description: 'Return information about all local dev environments',
	},
	{
		usage: `vip @123 ${ DEV_ENVIRONMENT_SUBCOMMAND } info`,
		description: 'Return information about dev environment for site 123',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } info --slug=my_site`,
		description: 'Return information about a local dev environment named "my_site"',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'all', 'Show Info for all local dev environments' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );

		debug( 'Args: ', arg, 'Options: ', opt );

		try {
			if ( opt.all ) {
				await printAllEnvironmentsInfo();
			} else {
				await printEnvironmentInfo( slug );
			}
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
