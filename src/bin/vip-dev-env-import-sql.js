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
import { getEnvironmentPath } from 'lib/dev-environment/dev-environment-core';
import { exec } from 'lib/dev-environment/dev-environment-core';
import { searchAndReplace } from 'lib/search-and-replace';
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
	.option( 'search-replace', 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		const [ fileName ] = unmatchedArgs;

		const { searchReplace, inPlace } = opt;
		const slug = getEnvironmentName( opt );

		try {
			let resolvedPath = path.resolve( fileName );

			if ( ! fs.existsSync( resolvedPath ) ) {
				throw new Error( 'The provided file does not exist or it is not valid (see "--help" for examples)' );
			}

			// Run Search and Replace if the --search-replace flag was provided
			if ( searchReplace && searchReplace.length ) {
				const { outputFileName } = await searchAndReplace( resolvedPath, searchReplace, {
					isImport: true,
					output: true,
					inPlace,
				} );

				if ( typeof outputFileName !== 'string' ) {
					throw new Error( 'Unable to determine location of the intermediate search & replace file.' );
				}

				const environmentPath = getEnvironmentPath( slug );
				const baseName = path.basename( outputFileName );

				resolvedPath = path.join( environmentPath, baseName );
				fs.renameSync( outputFileName, resolvedPath );
			}

			const dockerPath = resolvedPath.replace( os.homedir(), '/user' );
			const arg = [ 'wp', 'db', 'import', dockerPath ];

			await exec( slug, arg );

			// Removing search and replace temp SQL file
			if ( searchReplace && searchReplace.length && ! inPlace ) {
				fs.unlinkSync( resolvedPath );
			}
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
