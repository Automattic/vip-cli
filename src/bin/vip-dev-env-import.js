#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql file.sql`,
		description: 'Import the given SQL file to your site',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media path/to/wp-content/uploads`,
		description:
			'Import contents of the given WP uploads folder file into the media library of the default dev environment',
	},
];

command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.command( 'sql', 'Import SQL to your dev-env database from a file' )
	.command(
		'media',
		'Import media files to the dev environment of your application from a compressed web archive. ' +
			'This command will copy the contents of a folder to the `uploads` folder of the target dev environment.'
	)
	.argv( process.argv );
