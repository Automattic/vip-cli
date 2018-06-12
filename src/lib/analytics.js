/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import GoogleAnalytics from './analytics/google-analytics';
import Tracks from './analytics/tracks';
import env from './env';

let analytics = null;

export default function getInstance( uuid: string ): Analytics {
	if ( analytics ) {
		return analytics;
	}

	const gaAccountId = 'UA-7131263-5'; // TODO: this is batmoo's test ID
	const tracksUserType = 'vip';

	analytics = new Analytics( {
		googleAnalytics: new GoogleAnalytics( gaAccountId, uuid, env ),
		tracks: new Tracks( uuid, tracksUserType, env ),
	} );

	return analytics;
}
