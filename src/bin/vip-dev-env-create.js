#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import * as exit from 'lib/cli/exit';
import { createEnvironment, printEnvironmentInfo, getApplicationInformation, doesEnvironmentExist } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, promptForArguments, getEnvironmentStartCommand } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_SUBCOMMAND } from 'lib/constants/dev-environment';
import {
	addDevEnvConfigurationOptions,
	getOptionsFromAppInfo,
	handleCLIException,
	processBooleanOption,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import type { InstanceOptions } from '../lib/dev-environment/types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create`,
		description: 'Creates a local dev environment',
	},
	{
		usage: `vip @123.production ${ DEV_ENVIRONMENT_SUBCOMMAND } create`,
		description: 'Creates a local dev environment for production site for id 123',
	},
	{
		usage: `vip ${ DEV_ENVIRONMENT_SUBCOMMAND } create --slug=my_site`,
		description: 'Creates a local dev environment aliased as "my_site"',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --slug=test`,
		description: 'Assigning unique slugs to environments allows multiple environments to be created.',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --multisite --wordpress="5.8" --client-code="~/git/my_code"`,
		description: 'Creates a local multisite dev environment using WP 5.8 and client code is expected to be in "~/git/my_code"',
	},
];

const cmd = command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'title', 'Title for the WordPress site' )
	.option( 'multisite', 'Enable multisite install', undefined, processBooleanOption );

addDevEnvConfigurationOptions( cmd );

cmd.examples( examples );
cmd.argv( process.argv, async ( arg, opt ) => {
	await validateDependencies();

	const slug = getEnvironmentName( opt );
	debug( 'Args: ', arg, 'Options: ', opt );

	const trackingInfo = { slug };
	await trackEvent( 'dev_env_create_command_execute', trackingInfo );

	const startCommand = chalk.bold( getEnvironmentStartCommand( opt ) );

	const environmentAlreadyExists = doesEnvironmentExist( slug );
	if ( environmentAlreadyExists ) {
		const messageToShow = `Environment already exists\n\n\nTo start the environment run:\n\n${ startCommand }\n\n` +
			`To create another environment use ${ chalk.bold( '--slug' ) } option with a unique name.\n`;

		exit.withError( messageToShow );
	}

	let defaultOptions: $Shape<InstanceOptions> = {};

	try {
		if ( opt.app ) {
			const appInfo = await getApplicationInformation( opt.app, opt.env );
			defaultOptions = getOptionsFromAppInfo( appInfo );
		}
	} catch ( error ) {
		const message = `failed to fetch application "${ opt.app }" information`;

		debug( `WARNING: ${ message }`, error.message );
		console.log( chalk.yellow( 'Warning:' ), message );
	}

	const instanceData = await promptForArguments( opt, defaultOptions );
	instanceData.siteSlug = slug;

	try {
		await createEnvironment( instanceData );

		await printEnvironmentInfo( slug );

		const message = '\n' + chalk.green( '✓' ) + ` environment created.\n\nTo start it please run:\n\n${ startCommand }\n`;
		console.log( message );

		await trackEvent( 'dev_env_create_command_success', trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, 'dev_env_create_command_error', trackingInfo );
	}
} );
