/**
 * External dependencies
 */
import type { Response } from 'node-fetch';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import env from '../env';
import type { AnalyticsClient } from './clients/client';

const debug = debugLib( '@automattic/vip:analytics' );

/* eslint-disable camelcase */
const client_info = {
	cli_version: env.app.version,
	os_name: env.os.name,
	os_version: env.os.version,
	node_version: env.node.version,
};
/* eslint-enable camelcase */

export default class Analytics {
	private clients: AnalyticsClient[];

	constructor( clients: AnalyticsClient[] ) {
		this.clients = clients;
	}

	async trackEvent(
		name: string,
		props: Record< string, unknown > = {}
	): Promise< ( Response | false )[] > {
		if ( process.env.DO_NOT_TRACK ) {
			debug( `trackEvent() for ${ name } => skipping per DO_NOT_TRACK variable` );
			return [];
		}

		return Promise.all(
			this.clients.map( client =>
				client.trackEvent( name, {
					// eslint-disable-next-line camelcase
					...client_info,
					...props,
				} )
			)
		);
	}
}
