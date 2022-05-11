#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { exec } from 'lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { getEnvTrackingInfo, validateDependencies } from '../lib/dev-environment/dev-environment-cli';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec -- wp post list`,
		description: 'Use dev-environment to run `wp post list`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec --slug my_site -- wp shell`,
		description: 'Use dev-environment "my_site" to run interactive wp shell',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } exec -- add-site --new-site-slug subsite --new-site-title "New Subsite"`,
		description: 'Execute script to add a subsite to multisite dev environment',
	},
];

command( { wildcardCommand: true } )
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		await validateDependencies();
		const slug = getEnvironmentName( opt );

		const trackingInfo = getEnvTrackingInfo( slug );
		await trackEvent( 'dev_env_exec_command_execute', trackingInfo );

		try {
			// to avoid confusion let's enforce -- as a splitter for arguments for this command and wp itself
			const argSplitterIx = process.argv.findIndex( argument => '--' === argument );
			const argSplitterFound = argSplitterIx > -1;
			if ( unmatchedArgs.length > 0 && ! argSplitterFound ) {
				throw new Error( 'Please provide "--" argument to separate arguments for "vip" and command to be executed (see "--help" for examples)' );
			}

			let arg = [];
			if ( argSplitterFound && argSplitterIx + 1 < process.argv.length ) {
				arg = process.argv.slice( argSplitterIx + 1 );
			}

			await exec( slug, arg );
			await trackEvent( 'dev_env_exec_command_success', trackingInfo );
		} catch ( error ) {
			handleCLIException( error, 'dev_env_exec_command_error', trackingInfo );
		}
	} );
