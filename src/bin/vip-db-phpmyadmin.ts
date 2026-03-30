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
	{
		usage: 'vip @example-app.develop db phpmyadmin --print',
		description: 'Print the phpMyAdmin URL to stdout instead of opening it in a browser.',
	},
];

const appQuery = `
	id,
	name,
	environments{
		id
		appId
		name
		type
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
	.option( 'print', 'Print the phpMyAdmin URL to stdout instead of opening it in a browser.' )
	.option( 'silent', 'Do not print any output to the console.' )
	.examples( examples )
	.argv(
		process.argv,
		async (
			arg: string[],
			{
				app,
				env,
				print: printUrl,
				silent,
			}: { app: App; env: AppEnvironment; print: boolean; silent: boolean }
		) => {
			const trackerFn = makeCommandTracker( 'phpmyadmin', {
				app: app.id,
				env: env.uniqueLabel,
			} );
			await trackerFn( 'execute' );

			const cmd = new PhpMyAdminCommand( app, env, trackerFn, silent );
			await cmd.run( { print: printUrl } );

			await trackerFn( 'success' );
		}
	);
