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
import command from 'lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql file.sql`,
		description: 'Import the given SQL file to your site',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media https://<path_to_publicly_accessible_archive>`,
		description: 'Import contents of the given archive file into the media library of your site',
	},
];

command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.command( 'sql', 'Import SQL to your dev-env database from a file' )
	.command( 'media', 'Import media files to the dev environment of your application from a compressed web archive' )
	.argv( process.argv );
