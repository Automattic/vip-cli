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
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import UserError from '../lib/user-error';
import { DevEnvSyncSQLCommand } from '../lib/dev-environment/dev-environment-sync-sql';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } sync sql @my-test.develop --slug=my_site`,
		description: 'Syncs with the `my-test` site\'s `develop` environment database into `my_site`',
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
	}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	module: 'dev-env-sync-sql',
} )
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env, slug } ) => {
		const lando = await bootstrapLando();
		const envPath = getEnvironmentPath( slug );

		if ( ! await isEnvUp( lando, envPath ) ) {
			throw new UserError( 'Environment needs to be started first' );
		}

		const cmd = new DevEnvSyncSQLCommand( app, env, slug );
		await cmd.run();
	} );
