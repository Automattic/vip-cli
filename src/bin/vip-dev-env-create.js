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
import * as exit from 'lib/cli/exit';
import { createEnvironment, printEnvironmentInfo, getApplicationInformation, doesEnvironmentExist } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, promptForArguments, getEnvironmentStartCommand } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_SUBCOMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create`,
		description: 'Creates a local dev environment',
	},
	{
		usage: `vip @123.production ${ DEV_ENVIRONMENT_SUBCOMMAND } create`,
		description: 'Creates a local dev environment for prodaction site for id 123',
	},
	{
		usage: `vip @123.production ${ DEV_ENVIRONMENT_SUBCOMMAND } create --slug 'my_site'`,
		description: 'Creates a local dev environment for prodaction site for id 123 aliased as "my_site"',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --slug test`,
		description: 'Creates a blank local dev environment with custom name "test", this enables to create multiple independent environments',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --multisite --wordpress "5.8" --client-code "~/git/my_code"`,
		description: 'Creates a local multisite dev environment using WP 5.8 and client code is expected to be in "~/git/my_code"',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'title', 'Title for the WordPress site (default: "VIP Dev")' )
	.option( 'multisite', 'Enable multisite install', undefined, value => 'false' !== value?.toLowerCase?.() )
	.option( 'wordpress', 'Use a specific WordPress version or local directory (default: last stable)' )
	.option( [ 'u', 'mu-plugins' ], 'Use a specific mu-plugins changeset or local directory (default: "auto": last commit in master)' )
	.option( 'client-code', 'Use the client code from a local directory or VIP skeleton (default: use the VIP skeleton)' )
	.option( 'statsd', 'Enable statsd component. By default it is disabled', undefined, value => 'false' !== value?.toLowerCase?.() )
	.option( 'phpmyadmin', 'Enable PHPMyAdmin component. By default it is disabled', undefined, value => 'false' !== value?.toLowerCase?.() )
	.option( 'xdebug', 'Enable XDebug. By default it is disabled', undefined, value => 'false' !== value?.toLowerCase?.() )
	.option( 'elasticsearch', 'Explicitly choose Elasticsearch version to use' )
	.option( 'mariadb', 'Explicitly choose MariaDB version to use' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );
		debug( 'Args: ', arg, 'Options: ', opt );

		const startCommand = chalk.bold( getEnvironmentStartCommand( opt ) );

		const environmentAlreadyExists = doesEnvironmentExist( slug );
		if ( environmentAlreadyExists ) {
			const messageToShow = `Environment already exists\n\n\nTo start the environment run:\n\n${ startCommand }\n\n` +
				`To create another environment use ${ chalk.bold( '--slug' ) } option with a unique name.\n`;

			exit.withError( messageToShow );
		}

		let appInfo: any = {};
		try {
			if ( opt.app ) {
				appInfo = await getApplicationInformation( opt.app, opt.env );
			}
		} catch ( error ) {
			const message = `failed to fetch application "${ opt.app }" information`;

			debug( `WARNING: ${ message }`, error.message );
			console.log( chalk.yellow( 'Warning:' ), message );
		}

		const instanceData = await promptForArguments( opt, appInfo );
		const instanceDataWithSlug = {
			...instanceData,
			siteSlug: slug,
			statsd: opt.statsd || false,
			phpmyadmin: opt.phpmyadmin || false,
			xdebug: opt.xdebug || false,
		};

		try {
			await createEnvironment( instanceDataWithSlug );

			await printEnvironmentInfo( slug );

			const message = '\n' + chalk.green( '✓' ) + ` environment created.\n\nTo start it please run:\n\n${ startCommand }\n`;
			console.log( message );
		} catch ( error ) {
			exit.withError( error.message );
		}
	} );
