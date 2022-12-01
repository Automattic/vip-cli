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
import * as exit from '../lib/cli/exit';
import { isMultiSiteInSiteMeta } from '../lib/validations/is-multi-site';
import { LAUNCH_STATUSES } from '../lib/constants/network-site';
import { NETWORK_SITE_BASE_USAGE } from './vip-network-site';
import setNetworkSiteLaunchStatus from '../lib/network-site/api-launch-status-set';

const baseUsage = `${ NETWORK_SITE_BASE_USAGE } launch-status set`;

// Command examples
const examples = [
	{
		usage: `${ baseUsage } BLOG_ID LAUNCH_STATUS`,
		description: 'Set the launch status for "BLOG_ID" to LAUNCHED/NOT_LAUNCHED in a multisite environment',
	},
];

export async function getLaunchStatus( arg: string[], opt ): void {
	const [ blogIdStr, launchStatus ] = arg;
	const blogId = parseInt( blogIdStr, 10 );

	if ( ! Number.isInteger( blogId ) || blogId <= 0 ) {
		exit.withError( `Invalid blogId: ${ blogId }. It should be a number.` );
	}
	if ( ! Object.keys( LAUNCH_STATUSES ).indexOf( launchStatus ) ) {
		exit.withError( `Invalid launch status: ${ launchStatus }. It should be either ${ LAUNCH_STATUSES.LAUNCHED } or ${ LAUNCH_STATUSES.NOT_LAUNCHED }.` );
	}

	const trackingParams = {
		app_id: opt.app.id,
		command: `${ baseUsage } ${ blogId } ${ launchStatus }`,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		variable_name: 'blogId',
	};

	debug( `Request: setting network site launch status for ${ getEnvContext( opt.app, opt.env ) } to ${ launchStatus }` );
	const isMultiSite = await isMultiSiteInSiteMeta( opt.app.id, opt.env.id );
	if ( ! isMultiSite ) {
		console.log( chalk.yellow( 'This is not a multisite environment' ) );
		process.exit();
	}
	await trackEvent( 'network_site_launch_status_set_command_execute', trackingParams );

	const launchStatusSetResponse = await setNetworkSiteLaunchStatus( opt.app.id, opt.env.id, blogId, launchStatus )
		.catch( async err => {
			rollbar.error( err );
			await trackEvent( 'network_site_launch_status_set_command_success', { ...trackingParams, error: err.message } );

			throw err;
		} );

	await trackEvent( 'network_site_launch_status_set_command_success', trackingParams );

	if ( ! launchStatusSetResponse ) {
		// TODO: improve handling of errors
		console.log( chalk.yellow( 'No network site information found' ) );
		process.exit();
	}

	console.log( `BlogId: ${ launchStatusSetResponse.blogId }` );
	console.log( `Was the launch status updated? ${ launchStatusSetResponse.updated }` );
	console.log( `Launch Status: ${ launchStatusSetResponse.launchStatus }` );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage: `${ baseUsage } <BLOG_ID> <LAUNCH_STATUS>`,
} )
	.examples( examples )
	.argv( process.argv, getLaunchStatus );

