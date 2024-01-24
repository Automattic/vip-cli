#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { PhpMyAdminCommand } from '../commands/phpmyadmin';
import { App, AppEnvironment } from '../graphqlTypes';
import command from '../lib/cli/command';
import { makeCommandTracker } from '../lib/tracker';

const examples = [
	{
		usage: 'vip db phpmyadmin @mysite.develop',
		description: 'Open PhpMyAdmin console for the database of the @mysite.develop environment',
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
	module: 'phpmyadmin',
	requiredArgs: 0,
	usage: 'vip db phpmyadmin',
} )
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env }: { app: App; env: AppEnvironment } ) => {
		const trackerFn = makeCommandTracker( 'phpmyadmin', {
			app: app.id,
			env: env.uniqueLabel,
		} );
		await trackerFn( 'execute' );

		const cmd = new PhpMyAdminCommand( app, env, trackerFn );
		await cmd.run();

		await trackerFn( 'success' );
	} );
