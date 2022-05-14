/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';
import env from '../env';

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

	async trackEvent( name, props = {} ): Promise {
		return Promise.all( this.clients.map( client => {
			return client.trackEvent( name, {
				// eslint-disable-next-line camelcase
				...client_info,
				...props,
			} );
		} ) );
	}
}
