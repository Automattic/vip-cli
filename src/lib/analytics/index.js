/**
 * Internal dependencies
 */
import AnalyticsClient from './client';

export default class Analytics {
	constructor( { googleAnalytics = new AnalyticsClient, tracks = new AnalyticsClient } ) {
		this.googleAnalytics = googleAnalytics;
		this.tracks = tracks;
	}

	async trackEvent( name, props ): Promise<AnalyticsClient> {
		return await Promise.all( [
			this.googleAnalytics.trackEvent( name, props ),
			this.tracks.trackEvent( name, props )
		] );
	}
}
