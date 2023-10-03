#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import {
	createEnvironment,
	printEnvironmentInfo,
	getApplicationInformation,
	doesEnvironmentExist,
	getEnvironmentPath,
} from '../lib/dev-environment/dev-environment-core';
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
	handleDeprecatedOptions,
} from '../lib/dev-environment/dev-environment-cli';
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_SUBCOMMAND,
} from '../lib/constants/dev-environment';
import {
	getConfigurationFileOptions,
	printConfigurationFile,
	mergeConfigurationFileOptions,
} from '../lib/dev-environment/dev-environment-configuration-file';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

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
		description:
			'Assigning unique slugs to environments allows multiple environments to be created.',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --multisite --wordpress="5.8" --app-code="~/git/my_code"`,
		description:
			'Creates a local multisite dev environment using WP 5.8 and application code is expected to be in "~/git/my_code"',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --multisite=subdirectory --wordpress="5.8" --app-code="~/git/my_code"`,
		description:
			'Creates a local multisite dev environment with a subdirectory URL structure using WP 5.8 and application code is expected to be in "~/git/my_code"',
	},
];

const cmd = command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'title', 'Title for the WordPress site' )
	.option( 'multisite', 'Enable multisite install', undefined, processStringOrBooleanOption );

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

	handleDeprecatedOptions( opt );

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
		console.log( '\nUsing configuration from file.' );
		printConfigurationFile( configurationFileOptions );
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
			` environment created.\n\nTo start it please run:\n\n${ startCommand }\n`;
		console.log( message );

		await trackEvent( 'dev_env_create_command_success', trackingInfo );
	} catch ( error ) {
		await handleCLIException( error, 'dev_env_create_command_error', trackingInfo );
		process.exitCode = 1;
	}
} );
