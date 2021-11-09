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
import command from 'lib/cli/command';
import { getEnvironmentName } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { addDevEnvConfigurationOptions, handleCLIException, promptForArguments } from '../lib/dev-environment/dev-environment-cli';
import type { InstanceOptions } from '../lib/dev-environment/dev-environment-cli';
import { doesEnvironmentExist, readEnvironmentData } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../lib/constants/dev-environment';

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

	try {
		const environmentAlreadyExists = doesEnvironmentExist( slug );
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

		debug( 'Combined preselected data are', preselectedOptions );

		const defaultOptions: InstanceOptions = {
			clientCode: currentInstanceData.clientCode.dir || currentInstanceData.clientCode.tag,
			muPlugins: currentInstanceData.muPlugins.dir || currentInstanceData.muPlugins.tag,
			wordpress: currentInstanceData.wordpress.tag,
			elasticsearch: currentInstanceData.elasticsearch,
			mariadb: currentInstanceData.mariadb,

		}

		const instanceData = await promptForArguments( preselectedOptions, currentInstanceData );
		// const instanceDataWithSlug = {
		// 	...currentInstanceData,
		// 	siteSlug: slug,
		// 	statsd: opt.statsd || false,
		// 	phpmyadmin: opt.phpmyadmin || false,
		// 	xdebug: opt.xdebug || false,
		// };
	} catch ( error ) {
		if ( 'ENOENT' === error.code ) {
			const message = 'Environment was created before update was supported.\n\nTo update environment please destroy it and create a new one.';
			handleCLIException( new Error( message ) );
		} else {
			handleCLIException( error );
		}
	}
} );
