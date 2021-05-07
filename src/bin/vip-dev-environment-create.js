#!/usr/bin/env node

/**
 * @flow
 * @fomat
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
import { createEnvironment, printEnvironmentInfo, getApplicationInformation, doesEnvironmentExist } from 'lib/dev-environment/dev-environment-core';
import { getEnvironmentName, promptForArguments, getEnvironmentStartCommand } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_SUBCOMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
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
		description: 'Creates a blank local dev environment with custom name "test", this enables to create multiple independend environments',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } create --multisite --wordpress "5.6" --client-code "~/git/my_code"`,
		description: 'Creates a local dev environment that is multisite and is using WP 5.6 and client code is expected to be in "~/git/my_code"',
	},
];

command()
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'title', 'Title for the WordPress site (default: "VIP Dev")' )
	.option( 'multisite', 'Enable multisite install' )
	.option( 'php', 'Use a specific PHP version' )
	.option( 'wordpress', 'Use a specific WordPress version or local directory (default: last stable)' )
	.option( 'mu-plugins', 'Use a specific mu-plugins changeset or local directory (default: "auto": last commit in master)' )
	.option( 'jetpack', 'Use a specific Jetpack from a local directory (default: "mu": use the version in mu-plugins)' )
	.option( 'client-code', 'Use the client code from a local directory or VIP skeleton (default: use the VIP skeleton)' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = getEnvironmentName( opt );
		debug( 'Args: ', arg, 'Options: ', opt );

		const startCommand = chalk.bold( getEnvironmentStartCommand( opt ) );

		const environmentAlreadyExists = doesEnvironmentExist( slug );
		if ( environmentAlreadyExists ) {
			const messageToShow = `Environment already exists\n\n\nTo start the environment run:\n\n${ startCommand }\n\n` +
				`To create another environment use ${ chalk.bold( '--slug' ) } option with a unique name.\n`;

			console.log( chalk.red( 'Error:' ), messageToShow );
			return;
		}

		let appInfo: any = {};
		try {
			if ( opt.app ) {
				appInfo = await getApplicationInformation( opt.app, opt.env );
			}
		} catch ( e ) {
			const message = `failed to fetch application "${ opt.app }" information`;

			debug( `WARNING: ${ message }`, e.message );
			console.log( chalk.yellow( 'Warning:' ), message );
		}

		const instanceData = await promptForArguments( opt, appInfo );
		const instanceDataWithSlug = {
			...instanceData,
			siteSlug: slug,
		};


		try {
			await createEnvironment( instanceDataWithSlug );

			await printEnvironmentInfo( slug );

			const message = '\n' + chalk.green( '✓' ) + ` environment created.\n\nTo start it please run:\n\n${ startCommand }\n`;
			console.log( message );
		} catch ( e ) {
			console.log( chalk.red( 'Error:' ), e.message );
		}
	} );
