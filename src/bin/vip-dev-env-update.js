#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_NOT_FOUND,
	DEV_ENVIRONMENT_PHP_VERSIONS,
} from '../lib/constants/dev-environment';
import {
	addDevEnvConfigurationOptions,
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processSlug,
	promptForArguments,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import {
	getConfigurationFileOptions,
	mergeConfigurationFileOptions,
} from '../lib/dev-environment/dev-environment-configuration-file';
import {
	doesEnvironmentExist,
	getEnvironmentPath,
	readEnvironmentData,
	updateEnvironment,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env update';
const usage = 'vip dev-env update';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Update the settings of a local environment named "example-site" in the setup wizard.',
	},
	{
		usage: `${ exampleUsage } --php=8.2 --app-code=/Users/example/Desktop/example-app-code --slug=example-site`,
		description: 'Update the version of PHP running on the local environment to 8.2 and load application code from a path on the user\'s local machine.\n' +
		'       * Options that are set in the command will be skipped in the setup wizard.',
	},
];
const cmd = command( {
	usage,
} ).option( 'slug', 'A unique name for a local environment. Default is "vip-local".',
	undefined,
	processSlug
);

addDevEnvConfigurationOptions( cmd );

cmd.examples( examples );
cmd.argv( process.argv, async ( arg, opt ) => {
	const slug = await getEnvironmentName( opt );

	const lando = await bootstrapLando();
	await validateDependencies( lando, slug );

	const trackingInfo = getEnvTrackingInfo( slug );
	await trackEvent( 'dev_env_update_command_execute', trackingInfo );

	try {
		const environmentAlreadyExists = await doesEnvironmentExist( getEnvironmentPath( slug ) );
		if ( ! environmentAlreadyExists ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		const currentInstanceData = readEnvironmentData( slug );

		debug( 'Read instance data', currentInstanceData );

		/** @type {InstanceOptions} */
		const preselectedOptions = {
			title: currentInstanceData.wpTitle,
			multisite: currentInstanceData.multisite,
			...opt,
		};

		const configurationFileOptions = await getConfigurationFileOptions();
		const thereAreOptionsFromConfigFile = Object.keys( configurationFileOptions ).length > 0;
		const finalPreselectedOptions = mergeConfigurationFileOptions(
			preselectedOptions,
			configurationFileOptions
		);

		/** @type {InstanceOptions} */
		const defaultOptions = {
			appCode: currentInstanceData.appCode.dir || currentInstanceData.appCode.tag || 'latest',
			muPlugins: currentInstanceData.muPlugins.dir || currentInstanceData.muPlugins.tag || 'latest',
			wordpress: currentInstanceData.wordpress.tag || 'trunk',
			elasticsearch: currentInstanceData.elasticsearch,
			php:
				currentInstanceData.php ||
				DEV_ENVIRONMENT_PHP_VERSIONS[ Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS )[ 0 ] ].image,
			mariadb: currentInstanceData.mariadb,
			phpmyadmin: currentInstanceData.phpmyadmin,
			xdebug: currentInstanceData.xdebug,
			mailpit: currentInstanceData.mailpit,
			photon: currentInstanceData.photon,
			mediaRedirectDomain: currentInstanceData.mediaRedirectDomain,
			multisite: false,
			title: '',
		};

		const providedOptions = Object.keys( opt )
			.filter( option => option.length > 1 ) // Filter out single letter aliases
			.filter( option => ! [ 'debug', 'help', 'slug' ].includes( option ) ); // Filter out options that are not related to instance configuration

		const suppressPrompts = providedOptions.length > 0 || thereAreOptionsFromConfigFile;
		const instanceData = await promptForArguments(
			finalPreselectedOptions,
			defaultOptions,
			suppressPrompts
		);
		instanceData.siteSlug = slug;

		await updateEnvironment( instanceData );

		const message =
			'\n' +
			chalk.green( '✓' ) +
			' environment updated. Please start environment again for changes to take effect: ' +
			chalk.bold( `vip dev-env --slug ${ slug } start` );
		console.log( message );
		await trackEvent( 'dev_env_update_command_success', trackingInfo );
	} catch ( error ) {
		if ( 'ENOENT' === error.code ) {
			const message =
				'Environment was created before update was supported.\n\nTo update environment please destroy it and create a new one.';
			await handleCLIException(
				new Error( message ),
				'dev_env_update_command_error',
				trackingInfo
			);
		} else {
			await handleCLIException( error, 'dev_env_update_command_error', trackingInfo );
		}

		process.exitCode = 1;
	}
} );
