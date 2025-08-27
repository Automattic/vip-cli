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
			'Generate a fresh database backup for an environment and download a copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --table=wp_posts --table=wp_comments',
		description:
			'Generate a database backup including only the wp_posts and wp_comments tables, and download a copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --table=wp_posts,wp_comments',
		description:
			'Generate a database backup including only the wp_posts and wp_comments tables using comma-separated syntax, and download a copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --subsite-id=2 --subsite-id=3',
		description:
			'Generate a database backup including only the tables related to the subsites with IDs 2 and 3, and download a copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --subsite-id=2,3',
		description:
			'Generate a database backup including only the tables related to the subsites with IDs 2 and 3 using comma-separated syntax, and download a copy of that backup.',
	},
	{
		usage: 'vip @example-app.develop export sql --config-file=~/db-export-config.json',
		description:
			'Generate a database backup using the specified config file, and download a copy of that backup.',
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
		'A table to export from the remote environment. Multiple tables can be specified with multiple --table flags or as a comma-separated list.'
	)
	.option(
		'subsite-id',
		'The ID of a subsite/network site to export from the remote environment. Multiple subsite IDs can be specified with multiple --subsite-id flags or as a comma-separated list.'
	)
	.option(
		'wpcli-command',
		'The WP-CLI command to run on the remote environment to retrieve the database export configuration.'
	)
	.option( 'config-file', 'The backup copy config file to use for the export.', undefined )
	.option( 'generate-backup', 'Generate a fresh database backup and export a copy of that backup.' )
	.examples( examples )
	.argv(
		process.argv,
		async (
			arg,
			{ app, env, output, configFile, table, subsiteId, wpcliCommand, generateBackup }
		) => {
			const liveBackupCopyCLIOptions = parseLiveBackupCopyCLIOptions(
				configFile,
				table,
				subsiteId,
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
