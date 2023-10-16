#!/usr/bin/env node

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import {
	getEnvTrackingInfo,
	getEnvironmentName,
	handleCLIException,
	processBooleanOption,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { exec, getEnvironmentPath } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import { bootstrapLando, isEnvUp } from '../lib/dev-environment/dev-environment-lando';
import UserError from '../lib/user-error';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec -- wp post list`,
		description: 'Use dev-environment to run `wp post list`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec --slug my_site -- wp post list --posts_per_page=500`,
		description: 'Use dev-environment "my-site" to run `wp post list --posts_per_page=500`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec --slug my_site -- wp shell`,
		description: 'Use dev-environment "my_site" to run interactive wp shell',
	},
];

command( { wildcardCommand: true } )
	.option( 'slug', 'Custom name of the dev environment' )
	.option( 'force', 'Disable validations before task execution', undefined, processBooleanOption )
	.option( 'quiet', 'Suppress output', undefined, processBooleanOption )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const slug = await getEnvironmentName( opt );
		const lando = await bootstrapLando();
		await validateDependencies( lando, slug, opt.quiet );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_exec_command_execute', trackingInfo );

		try {
			// to avoid confusion let's enforce -- as a splitter for arguments for this command and wp itself
			const argSplitterIx = process.argv.findIndex( argument => '--' === argument );
			const argSplitterFound = argSplitterIx > -1;
			if ( unmatchedArgs.length > 0 && ! argSplitterFound ) {
				throw new Error(
					'Please provide "--" argument to separate arguments for "vip" and command to be executed (see "--help" for examples)'
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
					throw new UserError( 'Environment needs to be started before running a command' );
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
