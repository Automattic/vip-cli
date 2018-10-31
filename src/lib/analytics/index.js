/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';
import env from '../env';

const client_info = {
	'cli_version': env.app.version,
	'os_name': env.os.name,
	'os_version': env.os.version,
	'node_version': env.node.version,
};

export default class Analytics {
	constructor( {
		tracks = new AnalyticsClientStub(),
	} ) {
		this.tracks = tracks;
	}

	async trackEvent( name, props = {} ): Promise {
		return await Promise.all( [
			this.tracks.trackEvent( name, Object.assign( {}, client_info, props ) ),
		] );
	}
}
