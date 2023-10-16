#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { ExportSQLCommand } from '../commands/export-sql';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: 'vip export sql @mysite.develop',
		description: 'Export SQL file from your site and save it to the current directory',
	},
	{
		usage: 'vip export sql @mysite.develop --output=~/Desktop/export.sql.gz',
		description: 'The output file can be specified with the --output flag',
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
	.option( 'output', 'Specify the location where you want to save the export file' )
	.option(
		'generate-backup',
		'Exports a freshly created database backup instead of using the latest existing one'
	)
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
