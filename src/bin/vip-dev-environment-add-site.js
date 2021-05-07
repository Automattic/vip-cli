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
import { runAddSite } from 'lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

// Command examples
const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } wp -- post list`,
		description: 'Use dev-environment to run `wp post list`',
	},
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } wp --slug my_site -- shell`,
		description: 'Use dev-environment "my_site" to run interactive wp shell',
	},
];

command()
	.option( 'new-site-slug', 'Slug that the new site should be created with' )
	.option( 'new-site-title', 'Title that the new site should be created with' )
	.option( 'slug', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( _, opt ) => {
		const slug = getEnvironmentName( opt );

		try {
			if ( ! opt.newSiteSlug || ! opt.newSiteTitle ) {
				throw new Error( 'Both --new-site-slug and --new-site-title are required.' );
			}

			await runAddSite( slug, opt.newSiteSlug, opt.newSiteTitle );
		} catch ( e ) {
			handleCLIException( e );
		}
	} );
