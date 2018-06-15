/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import GoogleAnalytics from './analytics/google-analytics';
import Tracks from './analytics/tracks';
import Token from 'lib/token';
import config from 'root/config/config.json';
import env from './env';

let analytics = null;

async function init(): Analytics {
	const uuid = await Token.uuid();

	const gaAccountId = config.googleAnalyticsId;
	let googleAnalytics = null;
	if ( gaAccountId ) {
		googleAnalytics = new GoogleAnalytics( gaAccountId, uuid, env );
	}

	const tracksUserType = config.tracksUserType;
	const tracksEventPrefix = config.tracksEventPrefix;
	const tracks = new Tracks( uuid, tracksUserType, tracksEventPrefix, env );

	analytics = new Analytics( {
		googleAnalytics,
		tracks,
	} );

	return analytics;
}

async function getInstance(): Analytics {
	if ( analytics ) {
		return analytics;
	}

	analytics = init();

	return analytics;
}

export async function trackEvent( ...args ): Promise<Response> {
	try {
		getInstance()
			.trackEvent( ...args );
	} catch ( e ) {
		// TODO: add debug
	}

	// Analytics issues are not critical failures
	return Promise.resolve();
}
