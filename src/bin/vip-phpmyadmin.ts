#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

import { makeCommandTracker } from '../lib/tracker';
import { App, AppEnvironment } from '../graphqlTypes';
import { PhpMyAdminCommand } from '../commands/phpmyadmin';

const examples = [
	{
		usage: 'vip phpmyadmin @mysite.develop',
		description: 'Open PhpMyAdmin for the @mysite.develop environment',
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
	usage: 'vip phpmyadmin',
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
