#!/usr/bin/env node

import { DevEnvSyncSQLCommand } from '../commands/dev-env-sync-sql';
import command from '../lib/cli/command';
import {
	getEnvironmentName,
	processBooleanOption,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import { makeCommandTracker } from '../lib/tracker';
import UserError from '../lib/user-error';

const usage = 'vip dev-env sync sql';

const examples = [
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site`,
		description: 'Sync the database of the develop environment in the "example-app" application to a local environment named "example-site".',
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
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'force', 'Skip validations.', undefined, processBooleanOption )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const { app, env, ...optRest } = opt;
		const slug = await getEnvironmentName( optRest );
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
