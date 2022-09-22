#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from '../lib/cli/command';
import { getEnvironmentName, getEnvTrackingInfo, handleCLIException, validateDependencies } from '../lib/dev-environment/dev-environment-cli';
import { exec, resolveImportPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { validate } from '../lib/validations/sql';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql some-wp-db-file.sql`,
		description: 'Import the contents of a WordPress database from an SQL file',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --slug=my_site`,
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
	.option( [ 'r', 'search-replace' ], 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option( 'skip-validate', 'Do not perform file validation.' )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		await validateDependencies();
		const [ fileName ] = unmatchedArgs;
		const { searchReplace, inPlace } = opt;
		const slug = getEnvironmentName( opt );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_import_sql_command_execute', trackingInfo );

		try {
			const { resolvedPath, inContainerPath } = await resolveImportPath( slug, fileName, searchReplace, inPlace );

			if ( ! opt.skipValidate ) {
				const expectedDomain = `${ slug }.vipdev.lndo.site`;
				await validate( resolvedPath, {
					isImport: false,
					skipChecks: [],
					extraCheckParams: { siteHomeUrlLando: expectedDomain },
				} );
			}

			const execOptions = {
				force: !! opt.skipValidate,
			};
			const importArg = [ 'wp', 'db', 'import', inContainerPath ];
			await exec( slug, importArg, execOptions );

			if ( searchReplace && searchReplace.length && ! inPlace ) {
				fs.unlinkSync( resolvedPath );
			}

			const cacheArg = [ 'wp', 'cache', 'flush' ];
			await exec( slug, cacheArg, execOptions );

			const addUserArg = [ 'wp', 'dev-env-add-admin', '--username=vipgo', '--password=password' ];
			await exec( slug, addUserArg, execOptions );
			await trackEvent( 'dev_env_import_sql_command_success', trackingInfo );
		} catch ( error ) {
			handleCLIException( error, 'dev_env_import_sql_command_error', trackingInfo );
		}
	} );
