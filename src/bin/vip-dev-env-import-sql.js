#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { exec } from 'lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql some-wp-db-file.sql`,
		description: 'Import the contents of a WordPress database from an SQL file',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --slug my_site`,
		description: 'Import the contents of a WordPress database from an SQL file into `my_site`',
	},
];

command( {
	requiredArgs: 1,
} )
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		const [ fileName ] = unmatchedArgs;
		const slug = getEnvironmentName( opt );

		try {
			const resolvedPath = path.resolve( fileName );

			if ( ! fs.existsSync( resolvedPath ) ) {
				throw new Error( 'The provided file does not exist or it is not valid (see "--help" for examples)' );
			}
			const dockerPath = resolvedPath.replace( os.homedir(), '/user' );
			const arg = [ 'wp', 'db', 'import', dockerPath ];

			await exec( slug, arg );
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
