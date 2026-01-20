#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	processSlug,
	validateDependencies,
	getDevEnvLogFile,
} from '../lib/dev-environment/dev-environment-cli';
import {
	getAllEnvironmentNames,
	stopEnvironment,
} from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const exampleUsage = 'vip dev-env stop';
const usage = 'vip dev-env stop';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site`,
		description: 'Stop a local environment named "example-site".',
	},
	{
		usage: `${ exampleUsage } --all`,
		description: 'Stops all local environments.',
	},
];

command( {
	usage,
} )
	.option(
		'slug',
		'A unique name for a local environment. Default is "vip-local".',
		undefined,
		processSlug
	)
	.option( 'all', 'Stop all local environments.' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		debug( 'Args: ', arg, 'Options: ', opt );

		/** @type {Record< string, unknown >} */
		let trackingInfo;
		/** @type {string[]} */
		let environments;
		/** @type {string|undefined} */
		let logSlug;
		if ( opt.all ) {
			trackingInfo = { all: true };
			environments = getAllEnvironmentNames();
			logSlug = undefined;
		} else {
			const slug = await getEnvironmentName( opt );
			trackingInfo = getEnvTrackingInfo( slug );
			environments = [ slug ];
			logSlug = slug;
		}

		const lando = await bootstrapLando( { logFile: getDevEnvLogFile( logSlug ) } );
		validateDependencies( lando );

		await trackEvent( 'dev_env_stop_command_execute', trackingInfo );

		for ( const slug of environments ) {
			try {
				// eslint-disable-next-line no-await-in-loop
				await stopEnvironment( lando, slug );

				const message = chalk.green( '✓' ) + ` environment "${ slug }" stopped.\n`;
				console.log( message );
			} catch ( error ) {
				let err;
				if ( ! ( error instanceof Error ) ) {
					err = new Error( error?.toString() );
				} else {
					err = error;
				}

				process.exitCode = 1;
				const errorTrackingInfo = {
					...trackingInfo,
					failure: err.message,
					stack: err.stack,
				};

				// trackEvent does not throw
				// eslint-disable-next-line no-await-in-loop
				await trackEvent( 'dev_env_stop_command_error', errorTrackingInfo );

				console.error( chalk.red( 'Error:' ), err.message.replace( 'ERROR: ', '' ) );
			}
		}

		if ( process.exitCode === 0 ) {
			await trackEvent( 'dev_env_stop_command_success', trackingInfo );
		}
	} );
