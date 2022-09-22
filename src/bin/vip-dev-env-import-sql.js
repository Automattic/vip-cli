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
import { getEnvironmentName, getEnvTrackingInfo, handleCLIException, promptForBoolean, validateDependencies } from '../lib/dev-environment/dev-environment-cli';
import { exec, resolveImportPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { validate } from '../lib/validations/sql';
import { confirm } from '../lib/cli/prompt';
import { prompt } from 'enquirer';

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
		const [ fileName ] = unmatchedArgs;
		const { searchReplace, inPlace } = opt;
		const slug = getEnvironmentName( opt );
		await validateDependencies( slug );

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

			const importArg = [ 'wp', 'db', 'import', inContainerPath ];
			await exec( slug, importArg );

			if ( searchReplace && searchReplace.length && ! inPlace ) {
				fs.unlinkSync( resolvedPath );
			}

			const cacheArg = [ 'wp', 'cache', 'flush' ];
			await exec( slug, cacheArg );

			try {
				await exec( slug, [ 'wp', 'cli', 'has-command', 'vip-search' ] );
				const doIndex = await promptForBoolean( 'Do you wnat to index data in ElasticSearch (used by enterprise search)?', true );
				if ( doIndex ) {
					await exec( slug, [ 'wp', 'vip-search', 'index', '--setup', '--network-wide', '--skip-confirm' ] );
				}
			} catch ( e ) {
				// Exception means they don't have vip-search enabled.
			}

			const addUserArg = [ 'wp', 'dev-env-add-admin', '--username=vipgo', '--password=password' ];
			await exec( slug, addUserArg );
			await trackEvent( 'dev_env_import_sql_command_success', trackingInfo );
		} catch ( error ) {
			handleCLIException( error, 'dev_env_import_sql_command_error', trackingInfo );
		}
	} );
