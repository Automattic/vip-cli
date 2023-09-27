#!/usr/bin/env node

/**
 * External dependencies
 */

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
import {
	getEnvironmentName,
	processBooleanOption,
} from '../lib/dev-environment/dev-environment-cli';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } sync sql @my-test.develop --slug=my_site`,
		description: "Syncs with the `my-test` site's `develop` environment database into `my_site`",
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
		wpSitesSDS(first:500) {
			nodes {
				id
				blogId
				homeUrl
			}
		}
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
	.option( 'force', 'Disable validations before running sync', undefined, processBooleanOption )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const { app, env } = opt;
		const slug = await getEnvironmentName( opt );
		const trackerFn = makeCommandTracker( 'dev_env_sync_sql', {
			app: app.id,
			env: env.uniqueLabel,
			slug,
			multisite: env.isMultisite,
		} );
		await trackerFn( 'execute' );

		const lando = await bootstrapLando();
		const envPath = getEnvironmentPath( slug );

		if ( ! ( await isEnvUp( lando, envPath ) ) && ! opt.force ) {
			await trackerFn( 'env_not_running_error', { errorMessage: 'Environment was not running' } );
			throw new UserError( 'Environment needs to be started first' );
		}

		const cmd = new DevEnvSyncSQLCommand( app, env, slug, trackerFn );
		// TODO: There's a function called handleCLIException for dev-env that handles exceptions but DevEnvSyncSQLCommand has its own implementation.
		// We should probably use handleCLIException instead?
		const didCommandRun = await cmd.run();
		if ( ! didCommandRun ) {
			console.log( 'Command canceled by user.' );
		}
		await trackerFn( 'success' );
	} );
