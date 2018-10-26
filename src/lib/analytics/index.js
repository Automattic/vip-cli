/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';
import { version } from '../../../package.json';

const client_info = {
	node_version: process.version,
	os: process.platform,
	cli_version: version,
}

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
