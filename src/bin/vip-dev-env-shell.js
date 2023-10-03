#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	getEnvTrackingInfo,
	validateDependencies,
	getEnvironmentName,
	handleCLIException,
} from '../lib/dev-environment/dev-environment-cli';
import { bootstrapLando, landoShell } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const userMap = {
	nginx: 'www-data',
	php: 'www-data',
	database: 'mysql',
	memcached: 'memcache',
	elasticsearch: 'elasticsearch',
	phpmyadmin: 'www-data',
	mailhog: 'mailhog',
	mailpit: 'root',
	photon: 'root',
};

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } shell`,
		description: 'Spawns a shell in the dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } shell -r`,
		description: 'Spawns a shell in the dev environment under root user',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } shell -- ls -lha`,
		description: 'Runs `ls -lha` command in the shell in the dev environment',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } shell -S database -- ls -lha`,
		description:
			'Runs `ls -lha` command in the shell of the database service in the dev environment',
	},
];

/**
 * @param {string[]} args
 * @return {string[]}
 */
function getCommand( args ) {
	const splitterIdx = process.argv.findIndex( argument => '--' === argument );
	if ( args.length > 0 && splitterIdx === -1 ) {
		throw new Error(
			'Please provide "--" argument to separate arguments for "vip" and command to be executed (see "--help" for examples)'
		);
	}

	/** @type {string[]} */
	let cmd = [];
	if ( splitterIdx !== -1 && splitterIdx + 1 < process.argv.length ) {
		cmd = process.argv.slice( splitterIdx + 1 );
	}

	return cmd;
}

command( { wildcardCommand: true } )
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'root', 'Spawn a root shell' )
	.option( 'service', 'Spawn a shell in a specific service (php if omitted)' )
	.examples( examples )
	.argv( process.argv, async ( args, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, '', true );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_shell_command_execute', trackingInfo );

		debug( 'Args: ', args, 'Options: ', opt );

		const isRoot = !! opt.root;
		const service = opt.service || 'php';
		const user = isRoot ? 'root' : userMap[ service ] || 'www-data';
		const cmd = getCommand( args );
		try {
			await landoShell( lando, getEnvironmentPath( slug ), service, user, cmd );
			await trackEvent( 'dev_env_shell_command_success', trackingInfo );
		} catch ( error ) {
			// error.hide comes from Lando to  between normal errors and non-zero exit code from commands.
			// We don't want to track the latter as errors.
			if ( ! error.hide ) {
				await handleCLIException( error, 'dev_env_shell_command_error', trackingInfo );
				process.exitCode = 1;
			} else {
				await trackEvent( 'dev_env_shell_command_success', trackingInfo );
			}
		}
	} );
