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
		usage: 'vip @example-app.develop db phpmyadmin',
		description:
			"Generate access to a read-only phpMyAdmin web interface for the environment's database.",
	},
];

const appQuery = `
	id,
	environments{
		id
		appId
		name
		type
		uniqueLabel
		primaryDomain {
			name
		}
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
