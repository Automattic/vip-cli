#!/usr/bin/env node

import { ExportSQLCommand } from '../commands/export-sql';
import command from '../lib/cli/command';
import { parseLiveBackupCopyCLIOptions } from '../lib/live-backup-copy';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: 'vip @example-app.develop export sql',
		description:
			'Download an archived copy of the most recent database backup for an environment to the current local directory.',
	},
	{
		usage: 'vip @example-app.develop export sql --output=~/Desktop/export.sql.gz',
		description:
			'Download an archived copy of the most recent database backup for an environment to a specific file path.',
	},
	{
		usage: 'vip @example-app.develop export sql --generate-backup',
		description:
			'Generate a fresh database backup for an environment and download an archived copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --table=wp_posts --table=wp_comments',
		description:
			'Generate and download an archived partial database export file that includes only the wp_posts and wp_comments tables.',
	},
	{
		usage: 'vip @example-app.develop export sql --table=wp_posts,wp_comments',
		description:
			'Use comma-separated syntax to generate and download a partial database export file that includes only the wp_posts and wp_comments tables.',
	},
	{
		usage: 'vip @example-app.develop export sql --site-id=2 --site-id=3',
		description:
			'Generate and download a partial database export file that includes only the tables related to network site ID 2 and network site ID 3.',
	},
	{
		usage: 'vip @example-app.develop export sql --site-id=2,3',
		description:
			'Use comma-separated syntax to generate and download a partial database export file that includes only the tables related to the network site ID 2 and network site ID 3.',
	},
	{
		usage: 'vip @example-app.develop export sql --config-file=~/db-export-config.json',
		description:
			'Reference a local configuration file that defines the tables and structure for the partial database export file that is generated and dowloaded.',
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
	}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'export-sql',
	requiredArgs: 0,
	usage: 'vip export sql',
} )
	.option(
		'output',
		'Download the file to a specific local directory path with a custom file name.'
	)
	.option(
		'table',
		'The name of a table to include in the partial database export. Accepts a string value (can be passed more than once with different values), or multiple string values in a comma-separated list.'
	)
	.option(
		'site-id',
		'The ID of a network site to include in the partial database export. Accepts an integer value (can be passed more than once with different values), or multiple integer values in a comma-separated list.'
	)
	.option(
		'wpcli-command',
		'The WP-CLI command to run on the remote environment to retrieve the database export configuration.'
	)
	.option(
		'config-file',
		'A local configuration file that specifies the table data to include in the partial database export. Accepts a relative or absolute path to the file.',
		undefined
	)
	.option(
		'generate-backup',
		'Generate a fresh database backup and export an archived copy of that backup.'
	)
	.examples( examples )
	.argv(
		process.argv,
		async (
			arg,
			{ app, env, output, configFile, table, siteId, wpcliCommand, generateBackup }
		) => {
			const liveBackupCopyCLIOptions = parseLiveBackupCopyCLIOptions(
				configFile,
				table,
				siteId,
				wpcliCommand
			);

			const trackerFn = makeCommandTracker( 'export_sql', {
				app: app.id,
				env: env.uniqueLabel,
				generate_backup: generateBackup,
				live_backup_copy: liveBackupCopyCLIOptions?.useLiveBackupCopy,
			} );
			await trackerFn( 'execute' );

			const exportCommand = new ExportSQLCommand(
				app,
				env,
				{ outputFile: output, generateBackup, liveBackupCopyCLIOptions },
				trackerFn
			);
			await exportCommand.run();
			await trackerFn( 'success' );
		}
	);
