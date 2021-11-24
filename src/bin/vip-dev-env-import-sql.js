#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { getEnvironmentName, handleCLIException } from '../lib/dev-environment/dev-environment-cli';
import { exec, resolveImportPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql some-wp-db-file.sql`,
		description: 'Import the contents of a WordPress database from an SQL file',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --slug my_site`,
		description: 'Import the contents of a WordPress database from an SQL file into `my_site`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --search-replace="testsite.com,test-site.go-vip.net"`,
		description: 'Import the contents of a WordPress database from an SQL file and replace the occurrences of `testsite.com` with `test-site.go-vip.net`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --search-replace="testsite.com,test-site.go-vip.net" --in-place`,
		description: 'Import the contents of a WordPress database from an SQL file and replace the occurrences of `testsite.com` with `test-site.go-vip.net` in place (modifies the original SQL file)',
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
			const { resolvedPath, inContainerPath } = await resolveImportPath( slug, fileName, searchReplace, inPlace );

			const importArg = [ 'wp', 'db', 'import', inContainerPath ];
			await exec( slug, importArg );

			if ( searchReplace && searchReplace.length && ! inPlace ) {
				fs.unlinkSync( resolvedPath );
			}

			const cacheArg = [ 'wp', 'cache', 'flush' ];
			await exec( slug, cacheArg );

			try {
				const addUserArg = [ 'wp', 'user', 'create', 'vipgo', 'vipgo@go-vip.net', '--user_pass=password', '--role=administrator' ];
				await exec( slug, addUserArg );
			} catch ( exception ) {
				if ( ( exception.message || '' ).includes( 'is already registered' ) ) {
					console.log( chalk.bold( chalk.green( 'Success: ' ) ) + 'Skipping user vipgo provisioning' );
				} else {
					throw exception;
				}
			}
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
