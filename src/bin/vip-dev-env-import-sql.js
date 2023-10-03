#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	handleCLIException,
	getEnvironmentName,
} from '../lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { DevEnvImportSQLCommand } from '../commands/dev-env-import-sql';

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
		description:
			'Import the contents of a WordPress database from an SQL file and replace the occurrences of `testsite.com` with `test-site.go-vip.net`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } import sql wordpress.sql --search-replace="testsite.com,test-site.go-vip.net" --in-place`,
		description:
			'Import the contents of a WordPress database from an SQL file and replace the occurrences of `testsite.com` with `test-site.go-vip.net` in place (modifies the original SQL file)',
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
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const [ fileName ] = unmatchedArgs;
		const slug = await getEnvironmentName( opt );
		const cmd = new DevEnvImportSQLCommand( fileName, opt, slug );
		const trackingInfo = getEnvTrackingInfo( cmd.slug );

		try {
			await cmd.run();
			await trackEvent( 'dev_env_import_sql_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_import_sql_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
