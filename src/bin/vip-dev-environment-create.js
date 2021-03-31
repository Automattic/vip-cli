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
import { defaults, createEnvironment } from 'lib/dev-environment';
import { DEV_ENVIRONMENT_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: 'vip dev-environment create',
		description: 'Creates a local dev environment',
	},
	{
		usage: 'vip dev-environment create --slug test',
		description: 'Creates a local dev environment named "test", this enables to create multiple independend environments',
	},
];

command()
	.option( 'slug', `Custom name of the dev environment (default: "${ defaults.environmentSlug }")` )
	.option( 'title', 'Title for the WordPress site (default: "VIP Dev")' )
	.option( 'multisite', 'Enable multisite install' )
	.option( 'php', 'Use a specific PHP version' )
	.option( 'wordpress', 'Use a specific WordPress version or local directory (default: last stable)' )
	.option( 'mu-plugins', 'Use a specific mu-plugins changeset or local directory (default: "auto": last commit in master)' )
	.option( 'jetpack', 'Use a specific Jetpack from a local directory (default: "mu": use the version in mu-plugins)' )
	.option( 'client-code', 'Use the client code from a local directory or VIP skeleton (default: use the VIP skeleton)' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const slug = opt.slug || defaults.environmentSlug;

		debug( 'Args: ', arg, 'Options: ', opt );

		const extraCommandParmas = opt.slug ? ` --slug ${ opt.slug }` : '';
		const startCommand = chalk.bold( DEV_ENVIRONMENT_COMMAND + ' start' + extraCommandParmas );

		try {
			await createEnvironment( slug, opt );

			const message = chalk.green( '✓' ) + ` environment created.\n\n\nTo start it please run:\n\n${ startCommand }\n`;
			console.log( message );
		} catch ( e ) {
			let messageToShow = chalk.red( 'Error:' );
			if ( 'Environment already exists.' === e.message ) {
				messageToShow += `Environment already exists\n\n\nTo start the environment run:\n\n${ startCommand }\n\n` +
				`To create another environment use ${ chalk.bold( '--slug' ) } option with a unique name.\n`;
				console.log( messageToShow );
			} else {
				console.log( messageToShow, e.message );
			}
		}
	} );
