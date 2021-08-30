#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { getEnvironmentName, handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { exec } from 'lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

// Command examples
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
		const slug = getEnvironmentName( opt );

		try {
			// to avoid confusion let's enforce -- as a spliter for arguments for this command and wp itself
			const argSpliterIx = process.argv.findIndex( argument => '--' === argument );
			const argSpliterFound = argSpliterIx > -1;
			if ( unmatchedArgs.length > 0 && ! argSpliterFound ) {
				throw new Error( 'Please provide "--" argument to separate arguments for "vip" and command to be executed (see "--help" for examples)' );
			}

			let arg = [];
			if ( argSpliterFound && argSpliterIx + 1 < process.argv.length ) {
				arg = process.argv.slice( argSpliterIx + 1 );
			}

			await exec( slug, arg );
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
