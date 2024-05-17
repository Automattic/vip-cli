#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import {
	DEFAULT_SLUG,
	getEnvironmentName,
	promptForArguments,
	getEnvironmentStartCommand,
	addDevEnvConfigurationOptions,
	getOptionsFromAppInfo,
	handleCLIException,
	validateDependencies,
	processStringOrBooleanOption,
	processSlug,
} from '../lib/dev-environment/dev-environment-cli';
import {
	getConfigurationFileOptions,
	mergeConfigurationFileOptions,
} from '../lib/dev-environment/dev-environment-configuration-file';
import {
	createEnvironment,
	printEnvironmentInfo,
	getApplicationInformation,
	doesEnvironmentExist,
	getEnvironmentPath,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env create';
const usage = 'vip dev-env create';

// Command examples
const examples = [
	{
		usage: exampleUsage,
		description: 'Create a new VIP Local Development Environment.\n' +
		'       * The environment will be named "vip-local" by default if a custom name is not assigned with "--slug" .',
	},
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description:
			'Create a new local environment with the unique name "example-site".\n' +
			'       * Unique names allow multiple local environments to exist simultaneously.',
	},
	{
		usage: `${ exampleUsage } --slug=example-site --multisite=y --php=8.2 --wordpress=6.4`,
		description:
			'Create a new local environment configured as a multisite running PHP 8.2 and WordPress version 6.4.\n' +
			'       * Options that are set in the `create` command will be skipped in the setup wizard.',
	},
	{
		usage: `vip @example-app.production dev-env create --slug=example-site --app-code=/Users/example/Desktop/example-repo`,
		description: 'Create a new local environment with settings based on the production environment of the "example-app" application and load the locally git-cloned application repository "example-repo".',
	},
];

const cmd = command( {
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'title', 'A descriptive value for the WordPress Site Title. Default is "VIP Dev").' )
	.option( 'multisite', 'Create environment as a multisite. Accepts "y" for a subdomain multisite, "subdirectory" (recommended) for a subdirectory multisite, or "false". Default is "y".', undefined, processStringOrBooleanOption );

addDevEnvConfigurationOptions( cmd );

cmd.examples( examples );
cmd.argv( process.argv, async ( arg, opt ) => {
	const configurationFileOptions = await getConfigurationFileOptions();

	const environmentNameOptions = {
		slug: opt.slug,
		app: opt.app,
		env: opt.env,
		allowAppEnv: true,
	};

	let slug = DEFAULT_SLUG;

	const hasConfiguration =
		Object.keys( opt ).length !== 0 || Object.keys( configurationFileOptions ).length > 0;
	if ( hasConfiguration ) {
		slug = await getEnvironmentName( environmentNameOptions );
	}

	const lando = await bootstrapLando();
	await validateDependencies( lando, slug );

	debug( 'Args: ', arg, 'Options: ', opt );

	const trackingInfo = {
		slug,
		app: opt.app,
		env: opt.env,
	};
	await trackEvent( 'dev_env_create_command_execute', trackingInfo );

	const startCommand = chalk.bold( getEnvironmentStartCommand( slug, configurationFileOptions ) );

	const environmentAlreadyExists = await doesEnvironmentExist( getEnvironmentPath( slug ) );
	if ( environmentAlreadyExists ) {
		const messageToShow =
			`Environment already exists\n\n\nTo start the environment run:\n\n${ startCommand }\n\n` +
			`To create another environment use ${ chalk.bold( '--slug' ) } option with a unique name.\n`;

		exit.withError( messageToShow );
	}

	/** @type {InstanceOptions} */
	let defaultOptions = {};

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

	let preselectedOptions = opt;
	let suppressPrompts = false;

	if ( Object.keys( configurationFileOptions ).length > 0 ) {
		// Merge configuration from file
		preselectedOptions = mergeConfigurationFileOptions( opt, configurationFileOptions );
		suppressPrompts = true;
	}

	const instanceData = await promptForArguments(
		preselectedOptions,
		defaultOptions,
		suppressPrompts
	);
	instanceData.siteSlug = slug;

	try {
		await createEnvironment( instanceData );

		await printEnvironmentInfo( lando, slug, { extended: false, suppressWarnings: true } );

		const message =
			'\n' +
			chalk.green( '✓' ) +
			` environment created.\n\nTo start the environment run:\n\n${ startCommand }\n`;
		console.log( message );

		await trackEvent( 'dev_env_create_command_success', trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, 'dev_env_create_command_error', trackingInfo );
		process.exitCode = 1;
	}
} );
