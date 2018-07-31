/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';

export default class Analytics {
	constructor( {
		tracks = new AnalyticsClientStub()
	} ) {
		this.tracks = tracks;
	}

	async trackEvent( name, props = {} ): Promise {
		return await Promise.all( [
			this.tracks.trackEvent( name, props )
		] );
	}
}
