#!/usr/bin/env node

import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	validateDependencies,
	getEnvironmentName,
	handleCLIException,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import { getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, landoShell } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env shell';
const usage = 'vip dev-env shell';

const userMap = {
	nginx: 'www-data',
	php: 'www-data',
	database: 'mysql',
	memcached: 'memcache',
	elasticsearch: 'elasticsearch',
	phpmyadmin: 'www-data',
	mailpit: 'root',
	photon: 'root',
};

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Create and enter an SSH command shell for the PHP service (default) of the local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --root --slug=example-site`,
		description: 'Create and enter an SSH command shell with root privileges for the local environment.',
	},
	{
		usage: `${ exampleUsage } --slug=example-site -- ls -lha`,
		description: 'Create an SSH command shell for the local environment and run the command "ls -lha".\n' +
		'      * A double dash ("--") must separate the arguments of "vip" from those of the command.',
	},
	{
		usage: `${ exampleUsage } --service=database --slug=example-site -- ls -lha`,
		description:
			'Create an SSH command shell for the database service of the local environment and run the command "ls -lha".',
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
			'A double dash ("--") must separate the arguments of "vip" from those of the command to be executed. Run "vip dev-env shell --help" for examples.'
		);
	}

	/** @type {string[]} */
	let cmd = [];
	if ( splitterIdx !== -1 && splitterIdx + 1 < process.argv.length ) {
		cmd = process.argv.slice( splitterIdx + 1 );
	}

	return cmd;
}

command( { 
	wildcardCommand: true,
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'root', 'Create with root privileges.' )
	.option( 'service', 'Restrict to a single service.' )
	.examples( examples )
	.argv( process.argv, async ( args, opt ) => {
		const slug = await getEnvironmentName( opt );

		const lando = await bootstrapLando();
		await validateDependencies( lando, '' );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_shell_command_execute', trackingInfo );

		debug( 'Args: ', args, 'Options: ', opt );

		const isRoot = Boolean( opt.root );
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
