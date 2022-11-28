// @flow
/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { LAUNCH_STATUSES } from '../constants/network-site';

export type NetworkSiteInfo = {
	id?: number;
	blogId: number;
	homeUrl: string;
	siteUrl: string;
	launchStatus?: LAUNCH_STATUSES.LAUNCHED | LAUNCH_STATUSES.NOT_LAUNCHED;
	launchDate?: number;
	timestamp: number;
}

