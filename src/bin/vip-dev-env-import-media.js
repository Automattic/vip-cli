#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { getEnvironmentName, handleCLIException } from '../lib/dev-environment/dev-environment-cli';
import { importMediaPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media path/to/wp-content/uploads`,
		description: 'Import contents of the given WP uploads folder file into the media library of the default dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media path/to/wp-content/uploads --slug mysite`,
		description: 'Import contents of the given WP uploads folder file into the media library of a dev environment named `mysite`',
	},
];

command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.option( 'slug', 'Custom name of the dev environment' )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		const [ filePath ] = unmatchedArgs;
		const slug = getEnvironmentName( opt );

		try {
			await importMediaPath( slug, filePath );
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
