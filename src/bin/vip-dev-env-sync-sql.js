#!/usr/bin/env node

import { DevEnvSyncSQLCommand } from '../commands/dev-env-sync-sql';
import command from '../lib/cli/command';
import {
	getEnvironmentName,
	processBooleanOption,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { bootstrapLando, isContainerRunning } from '../lib/dev-environment/dev-environment-lando';
import { parseLiveBackupCopyCLIOptions } from '../lib/live-backup-copy';
import { makeCommandTracker } from '../lib/tracker';
import UserError from '../lib/user-error';

const usage = 'vip dev-env sync sql';

const examples = [
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site`,
		description:
			'Sync the entire database of the develop environment in the "example-app" application to a local environment named "example-site".',
	},
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site --table=wp_posts --table=wp_comments`,
		description:
			'Sync only the wp_posts and wp_comments tables from the database of the develop environment to a local environment named "example-site".',
	},
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site --table=wp_posts,wp_comments`,
		description:
			'Use comma-separated syntax to specify that only the wp_posts and wp_comments tables are synced.',
	},
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site --site-id=2 --site-id=3`,
		description: 'Sync only the tables related to network site ID 2 and network site ID 3.',
	},
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site --site-id=2,3`,
		description:
			'Use comma-separated syntax to specify that only the tables related to network site ID 2 and network site ID 3 are synced.',
	},
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site --config-file=~/dev-env-sync-config.json`,
		description:
			'Reference a local configuration file that specifies the data to sync to a local environment.',
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
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.option(
		'table',
		'The name of a table to include in the partial database sync. Accepts a string value and can be passed more than once with a different value, or add multiple values in a comma-separated list.'
	)
	.option(
		'site-id',
		'The ID of a network site to include in the partial database sync. Accepts an integer value (can be passed more than once with different values), or multiple integer values in a comma-separated list.'
	)
	.option(
		'wpcli-command',
		'Run a custom WP-CLI command that has logic to retrieve specific data for the partial database export.'
	)
	.option(
		'config-file',
		'A local configuration file that specifies the data to include in the partial database sync. Accepts a relative or absolute path to the file.',
		undefined
	)
	.option( 'force', 'Skip validations.', undefined, processBooleanOption )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const { app, env, configFile, table, siteId, wpcliCommand, ...optRest } = opt;

		const liveBackupCopyCLIOptions = parseLiveBackupCopyCLIOptions(
			configFile,
			table,
			siteId,
			wpcliCommand
		);

		const slug = await getEnvironmentName( optRest );
		const trackerFn = makeCommandTracker( 'dev_env_sync_sql', {
			app: app.id,
			env: env.uniqueLabel,
			slug,
			multisite: env.isMultisite,
		} );
		await trackerFn( 'execute' );

		const lando = await bootstrapLando();

		const isUp = (
			await Promise.all( [
				isContainerRunning( lando, slug, 'php' ),
				isContainerRunning( lando, slug, 'database' ),
			] )
		 ).every( Boolean );

		if ( ! isUp && ! opt.force ) {
			await trackerFn( 'env_not_running_error', { errorMessage: 'Environment was not running' } );
			throw new UserError( 'Environment needs to be started first' );
		}

		const cmd = new DevEnvSyncSQLCommand(
			app,
			env,
			slug,
			lando,
			trackerFn,
			liveBackupCopyCLIOptions
		);
		// TODO: There's a function called handleCLIException for dev-env that handles exceptions but DevEnvSyncSQLCommand has its own implementation.
		// We should probably use handleCLIException instead?
		const didCommandRun = await cmd.run();
		if ( ! didCommandRun ) {
			console.log( 'Command canceled by user.' );
		}
		await trackerFn( 'success' );
	} );
