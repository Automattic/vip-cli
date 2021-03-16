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
import { defaults, startEnvironment } from 'lib/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: 'vip dev-environment start',
		description: 'Starts local dev environment\n' +
		'       * If the environment isn\'t built yet it will build it as well',
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

		try {
			await startEnvironment( slug, opt );
		} catch ( e ) {
			console.log( chalk.red( 'Error:' ), e.message );
		}
	} );
