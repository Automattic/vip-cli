#!/usr/bin/env node

import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processBooleanOption,
	processSlug,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { exec, getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';
import UserError from '../lib/user-error';

const exampleUsage = 'vip dev-env exec';
const usage = 'vip dev-env exec';

const examples = [
	{
		usage: `${ exampleUsage } --slug=example-site -- wp post list`,
		description: 'Run a WP-CLI command against a local environment named "example-site".\n' +
		'      * A double dash ("--") must separate the arguments of "vip" from those of the "wp" command.',
	},
	{
		usage: `${ exampleUsage } --slug=example-site -- wp user list --url=example.example-site.vipdev.lndo.site`,
		description: 'Target the WP-CLI command against the network site "example.example-site.vipdev.lndo.site" of a local multisite environment.`',
	},
	{
		usage: `${ exampleUsage } --slug=example-site -- wp shell`,
		description: 'Run the WP-CLI command "wp shell" against a local environment to open an interactive PHP console.',
	},
];

command( { 
	wildcardCommand: true,
	usage,
} )
	.option( 'slug', 'A unique name for a local environment. Default is "vip-local".', undefined, processSlug )
	.option( 'force', 'Skip validation for a local environment to be in a running state.', undefined, processBooleanOption )
	.option( 'quiet', 'Suppress informational messages.', undefined, processBooleanOption )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const slug = await getEnvironmentName( opt );
		const lando = await bootstrapLando();
		await validateDependencies( lando, slug );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_exec_command_execute', trackingInfo );

		try {
			// to avoid confusion let's enforce -- as a splitter for arguments for this command and wp itself
			const argSplitterIx = process.argv.findIndex( argument => '--' === argument );
			const argSplitterFound = argSplitterIx > -1;
			if ( unmatchedArgs.length > 0 && ! argSplitterFound ) {
				throw new Error(
					'A double dash ("--") must separate the arguments of "vip" from those of the "wp" command. Run "vip dev-env exec --help" for examples.'
				);
			}

			/** @type {string[]} */
			let arg = [];
			if ( argSplitterFound && argSplitterIx + 1 < process.argv.length ) {
				arg = process.argv.slice( argSplitterIx + 1 );
			}

			if ( ! opt.force ) {
				const isUp = await isEnvUp( lando, getEnvironmentPath( slug ) );
				if ( ! isUp ) {
					throw new UserError( 'A WP-CLI command can only be executed on a running local environment.' );
				}
			}

			try {
				await exec( lando, slug, arg, { stdio: 'inherit' } );
			} catch ( error ) {
				if ( error instanceof UserError ) {
					throw error;
				}

				// Unfortunately, we are unable to get the exit code from Lando :-(
				process.exitCode = 1;
			}

			await trackEvent( 'dev_env_exec_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_exec_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
