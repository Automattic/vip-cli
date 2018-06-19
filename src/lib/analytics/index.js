/**
 * Internal dependencies
 */
import AnalyticsClientStub from './clients/stub';

export default class Analytics {
	constructor( {
		googleAnalytics = new AnalyticsClientStub(),
		tracks = new AnalyticsClientStub()
	} ) {
		this.googleAnalytics = googleAnalytics;
		this.tracks = tracks;
	}

	async trackEvent( name, props = {} ): Promise {
		return await Promise.all( [
			this.googleAnalytics.trackEvent( name, props ),
			this.tracks.trackEvent( name, props )
		] );
	}
}
