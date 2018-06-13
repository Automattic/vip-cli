/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import GoogleAnalytics from './analytics/google-analytics';
import Tracks from './analytics/tracks';
import config from 'root/config/config.json';
import env from './env';

let analytics = null;

export default function getInstance( uuid: string ): Analytics {
	if ( analytics ) {
		return analytics;
	}

	const gaAccountId = config.googleAnalyticsId;
	let googleAnalytics = null;
	if ( gaAccountId ) {
		googleAnalytics = new GoogleAnalytics( gaAccountId, uuid, env );
	}

	const tracksUserType = 'vip';
	const tracksEventPrefix = config.tracksEventPrefix;
	const tracks = new Tracks( uuid, tracksUserType, tracksEventPrefix, env );

	analytics = new Analytics( {
		googleAnalytics,
		tracks,
	} );

	return analytics;
}
