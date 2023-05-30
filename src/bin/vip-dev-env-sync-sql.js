#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import UserError from '../lib/user-error';
import { DevEnvSyncSQLCommand } from '../commands/dev-env-sync-sql';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } sync sql @my-test.develop --slug=my_site`,
		description: 'Syncs with the `my-test` site\'s `develop` environment database into `my_site`',
	},
];

const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		id
		appId
		type
		name
		primaryDomain { name }
		uniqueLabel
		isMultisite
	}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	module: 'dev-env-sync-sql',
} )
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env, slug } ) => {
		const trackerFn = makeCommandTracker( 'dev_env_sync_sql', { app: app.id, env: env.uniqueLabel, slug } );
		await trackerFn( 'execute' );

		if ( env.isMultisite ) {
			console.log( chalk.yellow( 'You seem to be trying to sync a SQL database for a network site.' ) );
			console.log( chalk.yellow( 'Unfortunately, the current version of our tool does not yet support syncing network sites.\n' ) );
			console.log( chalk.yellow( 'However, you can manually export the database using the following command:' ) );
			console.log( chalk.yellow( chalk.bold( `vip export sql @${ app.id }.${ env.uniqueLabel } --output=${ app.id }-${ env.uniqueLabel }-exported.sql.gz\n` ) ) );
			console.log( chalk.yellow( 'After exporting the database, you\'ll need to perform the necessary search and replace operations on the exported file to update any relevant data or configurations.' ) );
			console.log( chalk.yellow( 'See: https://docs.wpvip.com/how-tos/dev-env-add-content/#h-3-import-the-sql-file\n' ) );
			console.log( chalk.yellow( 'Once you\'ve made the required changes, you can import the modified SQL file into your development environment using the following command:' ) );
			console.log( chalk.yellow( chalk.bold( `vip dev-env import sql ${ app.id }-${ env.uniqueLabel }-exported.sql.gz --slug=${ slug }` ) ) );

			await trackerFn( 'aborted', { error_type: 'multisite_not_supported' } );
			process.exit( 0 );
		}

		const lando = await bootstrapLando();
		const envPath = getEnvironmentPath( slug );

		if ( ! await isEnvUp( lando, envPath ) ) {
			await trackerFn( 'env_not_running_error', { errorMessage: 'Environment was not running' } );
			throw new UserError( 'Environment needs to be started first' );
		}

		const cmd = new DevEnvSyncSQLCommand( app, env, slug, trackerFn );
		await cmd.run();
		await trackerFn( 'success' );
	} );
