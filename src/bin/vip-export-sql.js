#!/usr/bin/env node

/**
 * @flow
 * @format
 */

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
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env, output } ) => {
		const trackerFn = makeCommandTracker( 'export_sql', { app: app.id, env: env.uniqueLabel } );
		await trackerFn( 'execute' );

		const exportCommand = new ExportSQLCommand( app, env, output, trackerFn );
		await exportCommand.run();
		await trackerFn( 'success' );
	} );
