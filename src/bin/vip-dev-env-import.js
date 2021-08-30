#!/usr/bin/env node

/**
 * @flow
 * @fomat
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
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import db file.sql`,
		description: 'Use dev-environment to run `wp post list`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import media`,
		description: 'Use dev-environment "my_site" to run interactive wp shell',
	},
];

command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.command( 'sql', 'Import SQL to your dev-env database from a file' )
	.command( 'media', 'Import media files to the dev environment of your application from a compressed web archive' )
	.argv( process.argv );
