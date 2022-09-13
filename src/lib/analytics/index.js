/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';
import env from '../env';

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
	constructor( {
		clients = new AnalyticsClientStub(),
	} ) {
		this.clients = clients;
	}

	async trackEvent( name, props = {} ) {
		if ( process.env.DO_NOT_TRACK ) {
			debug( `trackEvent() for ${ name } => skipping per DO_NOT_TRACK variable` );

			return Promise.resolve( `Skipping trackEvent for ${ name } (DO_NOT_TRACK)` );
		}

		return Promise.all( this.clients.map( client => {
			return client.trackEvent( name, {
				// eslint-disable-next-line camelcase
				...client_info,
				...props,
			} );
		} ) );
	}
}
