#!/usr/bin/env node

import { DevEnvImportSQLCommand } from '../commands/dev-env-import-sql';
import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	handleCLIException,
	getEnvironmentName,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { makeCommandTracker } from '../lib/tracker';

const exampleUsage = 'vip dev-env import sql';
const usage = 'vip dev-env import sql';

const examples = [
	{
		usage: `${ exampleUsage } /Users/example/Downloads/file.sql --slug="example-site"`,
		description: 'Import the SQL file named "file.sql" from a path on the user\'s local machine to a running local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } /Users/example/Downloads/file.sql --search-replace="example-site.com,example-site.vipdev.lndo.site" --slug="example-site"`,
		description:
			'Search for the string "example-site.com" in the SQL file and replace it with "example-site.vipdev.lndo.site" during the import.`',
	},
	{
		usage: `${ exampleUsage } /Users/example/Downloads/file.sql --search-replace="example-site.com,example-site.vipdev.lndo.site" --skip-reindex --slug="example-site"`,
		description:
			'Import the SQL file to a local environment with Elasticsearch enabled, but do not reindex after the import is completed.`',
	},
	{
		usage: `${ exampleUsage } /Users/example/Downloads/file.sql --search-replace="example-site.com,example-site.vipdev.lndo.site" --in-place`,
		description:
			'Run a search and replace during the import and also save the results of the search and replace operation to the original SQL file ("file.sql").',
	},
	{
		usage: `${ exampleUsage } /Users/example/Downloads/file.sql --search-replace="example-site.com/site-three,site-three.example-site.vipdev.lndo.site" --search-replace="example-site.com,example-site.vipdev.lndo.site" --slug="example-site"`,
		description:
			'Search and replace 2 pairs of strings during the import of the SQL file to a local multisite environment.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( [ 'r', 'search-replace' ], 'Search for a string in the SQL file and replace it with a new string.' )
	.option( 'in-place', 'Save the results of a search and replace operation to the original SQL file.' )
	.option( 'skip-validate', 'Skip file validation.' )
	.option( [ 'k', 'skip-reindex' ], 'Skip Elasticsearch reindex after import.' )
	.option( 'quiet', 'Skip confirmation and suppress informational messages.' )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const [ fileName ] = unmatchedArgs;
		const slug = await getEnvironmentName( opt );
		const cmd = new DevEnvImportSQLCommand( fileName, opt, slug );
		const trackingInfo = getEnvTrackingInfo( cmd.slug );
		const trackerFn = makeCommandTracker( 'dev_env_import_sql', trackingInfo );
		await trackerFn( 'execute' );

		try {
			await cmd.run();
			await trackerFn( 'success' );
		} catch ( error ) {
			await handleCLIException( error );
			await trackerFn( 'error', { message: error.message, stack: error.stack } );
			process.exitCode = 1;
		}
	} );
