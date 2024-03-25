#!/usr/bin/env node

import { ExportSQLCommand } from '../commands/export-sql';
import command from '../lib/cli/command';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: 'vip @example-app.develop export sql',
		description:
			'Download a copy of the most recent database backup for an environment as an archived SQL file to the current local directory.',
	},
	{
		usage: 'vip @example-app.develop export sql --output=~/Desktop/export.sql.gz',
		description:
			'Download the archived SQL file to a specific local directory with a custom file name.',
	},
	{
		usage: 'vip @example-app.develop export sql --generate-backup',
		description:
			'Generate a fresh database backup for an environment and download a copy of that backup.',
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
	.option( 'generate-backup', 'Generate a fresh database backup and export a copy of that backup.' )
	.examples( examples )
	.argv( process.argv, async ( arg, { app, env, output, generateBackup } ) => {
		const trackerFn = makeCommandTracker( 'export_sql', {
			app: app.id,
			env: env.uniqueLabel,
			generate_backup: generateBackup,
		} );
		await trackerFn( 'execute' );

		const exportCommand = new ExportSQLCommand(
			app,
			env,
			{ outputFile: output, generateBackup },
			trackerFn
		);
		await exportCommand.run();
		await trackerFn( 'success' );
	} );
