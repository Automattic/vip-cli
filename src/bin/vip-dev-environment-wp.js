#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { defaults, handleCLIException, runWp } from 'lib/dev-environment';
import { DEV_ENVIRONMENT_COMMAND } from 'lib/constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_COMMAND } wp -- post list`,
		description: 'Use dev-environment to run `wp post list`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_COMMAND } wp --slug my_site -- shell`,
		description: 'Use dev-environment "my_site" to run interactive wp shell',
	},
];

command( { wildcardCommand: true } )
	.option( 'slug', `Custom name of the dev environment (default: "${ defaults.environmentSlug }")` )
	.examples( examples )
	.argv( process.argv, async ( unmatchedArgs, opt ) => {
		const slug = opt.slug || defaults.environmentSlug;

		try {
			// to avoid confusion let's enforce -- as a spliter for arguments for this command and wp itself
			const argSpliterIx = process.argv.findIndex( argument => '--' === argument );
			const argSpliterFound = argSpliterIx > -1;
			if ( unmatchedArgs.length > 0 && ! argSpliterFound ) {
				throw new Error( 'Please provide "--" argument to separate arguments for "vip" and "wp" commands (see "--help" for examples)' );
			}

			let arg = [];
			if ( argSpliterFound && argSpliterIx + 1 < process.argv.length ) {
				arg = process.argv.slice( argSpliterIx + 1 );
			}

			await runWp( slug, arg );
		} catch ( e ) {
			handleCLIException( e, opt.slug );
		}
	} );
