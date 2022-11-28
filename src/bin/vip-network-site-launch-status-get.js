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
import { appQuery, getEnvVar } from 'lib/envvar/api';
import { debug, getEnvContext } from 'lib/envvar/logging';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';
import getNetworkSite from '../lib/network-site/network-site-details';
import * as exit from '../lib/cli/exit';
import { isMultiSiteInSiteMeta } from '../lib/validations/is-multi-site';
import { LAUNCH_STATUSES, LAUNCH_STATUSES_LABELS } from '../lib/constants/network-site';

const baseUsage = 'vip @mysite.develop network-site launch-status get';

// Command examples
const examples = [
	{
		usage: `${ baseUsage } BLOG_ID`,
		description: 'Get the launch status for "BLOG_ID" in a multisite environment',
	},
];

export async function getLaunchStatus( arg: string[], opt ): void {
	// todo add tracking
	// Help the user by uppercasing input.
	// TODO validate number
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
	//await trackEvent( 'network_site_list_command_execute', trackingParams );
	// TODO (should we always print the launch status?
	const networkSiteDetails = await getNetworkSite( opt.app.id, opt.env.id, blogId, opt.env.type )
		.catch( async err => {
			//rollbar.error( err );
			//await trackEvent( 'network_site_list_query_error', { ...trackingParams, error: err.message } );

			throw err;
		} );

	//await trackEvent( 'network_site_list_command_success', trackingParams );

	if ( ! networkSiteDetails ) {
		console.log( chalk.yellow( 'No network site information found' ) );
		process.exit();
	}
	// TODO print launch status in different colors
	// TODO convert Launch codes to human readable strings
	// TODO should we expose the launching status or simply show yes/no like we do
	if ( networkSiteDetails.launchStatus === LAUNCH_STATUSES.LAUNCHED ) {
		console.log( `Launch status: ✅ ${ chalk.green( LAUNCH_STATUSES_LABELS.LAUNCHED ) }` );
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

