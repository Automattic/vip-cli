#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { appQuery } from 'lib/envvar/api';
import { debug, getEnvContext } from 'lib/envvar/logging';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';
import getNetworkSite from '../lib/network-site/api-get';
import * as exit from '../lib/cli/exit';
import { isMultiSiteInSiteMeta } from '../lib/validations/is-multi-site';
import { LAUNCH_STATUSES, LAUNCH_STATUSES_LABELS } from '../lib/constants/network-site';
import { NETWORK_SITE_BASE_USAGE } from './vip-network-site';

const baseUsage = `${ NETWORK_SITE_BASE_USAGE } launch-status get`;

// Command examples
const examples = [
	{
		usage: `${ baseUsage } BLOG_ID`,
		description: 'Get the launch status for "BLOG_ID" in a multisite environment',
	},
];

export async function getLaunchStatus( arg: string[], opt ): void {
	const blogId = parseInt( arg[ 0 ], 10 );
	if ( ! Number.isInteger( blogId ) || blogId <= 0 ) {
		exit.withError( `Invalid blogId: ${ blogId }. It should be a number.` );
	}

	const trackingParams = {
		app_id: opt.app.id,
		command: `${ baseUsage } ${ blogId }`,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		variable_name: 'blogId',
	};

	debug( `Request: network site launch status for ${ getEnvContext( opt.app, opt.env ) }` );
	const isMultiSite = await isMultiSiteInSiteMeta( opt.app.id, opt.env.id );
	if ( ! isMultiSite ) {
		console.log( chalk.yellow( 'This is not a multisite environment' ) );
		process.exit();
	}
	await trackEvent( 'network_site_launch_status_get_command_execute', trackingParams );

	const networkSiteDetails = await getNetworkSite( opt.app.id, opt.env.id, blogId, opt.env.type )
		.catch( async err => {
			rollbar.error( err );
			await trackEvent( 'network_site_launch_status_get_command_success', { ...trackingParams, error: err.message } );

			throw err;
		} );

	await trackEvent( 'network_site_launch_status_get_command_success', trackingParams );

	if ( ! networkSiteDetails ) {
		console.log( chalk.yellow( 'No network site information found' ) );
		process.exit();
	}

	console.log( `BlogId: ${ networkSiteDetails.blogId }` );
	console.log( `SiteURL: ${ networkSiteDetails.siteUrl }` );
	if ( networkSiteDetails.launchStatus === LAUNCH_STATUSES.LAUNCHED ) {
		console.log( `Launch status: ${ chalk.green( LAUNCH_STATUSES_LABELS.LAUNCHED ) }` );
	} else {
		console.log( `Launch status: ${ chalk.red( LAUNCH_STATUSES_LABELS.NOT_LAUNCHED ) } ` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage: `${ baseUsage } <BLOG_ID>`,
} )
	.examples( examples )
	.argv( process.argv, getLaunchStatus );

