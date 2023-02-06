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
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_NOT_FOUND, DEV_ENVIRONMENT_PHP_VERSIONS } from '../lib/constants/dev-environment';
import { addDevEnvConfigurationOptions, getEnvTrackingInfo, getEnvironmentName, handleCLIException, promptForArguments, validateDependencies } from '../lib/dev-environment/dev-environment-cli';
import type { InstanceOptions } from '../lib/dev-environment/types';
import { doesEnvironmentExist, getEnvironmentPath, readEnvironmentData, updateEnvironment } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } update`,
		description: 'Retriggers setup wizard in order to change environment configuration',
	},
];
const cmd = command().option( 'slug', 'Custom name of the dev environment' );

addDevEnvConfigurationOptions( cmd );

cmd.examples( examples );
cmd.argv( process.argv, async ( arg, opt ) => {
	const slug = getEnvironmentName( opt );

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

		const preselectedOptions = {
			// Title and multisite can't be changed during update
			title: currentInstanceData.wpTitle,
			multisite: currentInstanceData.multisite,
			...opt,
		};

		const defaultOptions: InstanceOptions = {
			appCode: currentInstanceData.appCode.dir || currentInstanceData.appCode.tag || 'latest',
			muPlugins: currentInstanceData.muPlugins.dir || currentInstanceData.muPlugins.tag || 'latest',
			wordpress: currentInstanceData.wordpress.tag || 'trunk',
			elasticsearch: currentInstanceData.elasticsearch,
			php: currentInstanceData.php || DEV_ENVIRONMENT_PHP_VERSIONS.default,
			mariadb: currentInstanceData.mariadb,
			phpmyadmin: currentInstanceData.phpmyadmin,
			xdebug: currentInstanceData.xdebug,
			mailhog: currentInstanceData.mailhog,
			mediaRedirectDomain: currentInstanceData.mediaRedirectDomain,
			multisite: false,
			title: '',
		};

		const providedOptions = Object.keys( opt )
			.filter( option => option.length > 1 ) // Filter out single letter aliases
			.filter( option => ! [ 'debug', 'help', 'slug' ].includes( option ) ); // Filter out options that are not related to instance configuration

		const suppressPrompts = providedOptions.length > 0;
		const instanceData = await promptForArguments( preselectedOptions, defaultOptions, suppressPrompts );
		instanceData.siteSlug = slug;

		await updateEnvironment( instanceData );

		const message = '\n' + chalk.green( '✓' ) + ' environment updated. Restart environment for changes to take an affect.';
		console.log( message );
		await trackEvent( 'dev_env_update_command_success', trackingInfo );
	} catch ( error ) {
		if ( 'ENOENT' === error.code ) {
			const message = 'Environment was created before update was supported.\n\nTo update environment please destroy it and create a new one.';
			await handleCLIException( new Error( message ), 'dev_env_update_command_error', trackingInfo );
		} else {
			await handleCLIException( error, 'dev_env_update_command_error', trackingInfo );
		}

		process.exitCode = 1;
	}
} );
