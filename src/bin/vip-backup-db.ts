#!/usr/bin/env node

import { BackupDBCommand } from '../commands/backup-db';
import { App, AppEnvironment } from '../graphqlTypes';
import command from '../lib/cli/command';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: 'vip backup db @mysite.develop',
		description: 'Trigger a new backup for your database of the @mysite.develop environment',
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

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'backup-db',
	requiredArgs: 0,
	usage: 'vip backup db',
} )
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env }: { app: App; env: AppEnvironment } ) => {
		const trackerFn = makeCommandTracker( 'backup_db', {
			app: app.id,
			env: env.uniqueLabel,
		} );
		await trackerFn( 'execute' );

		const cmd = new BackupDBCommand( app, env, trackerFn );
		await cmd.run();

		await trackerFn( 'success' );
	} );
