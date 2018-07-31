/**
 * External dependencies
 */
const debug = require( 'debug' )( '@automattic/vip:analytics' );

/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import Tracks from './analytics/clients/tracks';
import Token from 'lib/token';
import config from 'root/config/config.json';
import env from './env';

let analytics = null;

async function init(): Analytics {
	const uuid = await Token.uuid();

	const clients = {};

	const tracksUserType = config.tracksUserType;
	const tracksEventPrefix = config.tracksEventPrefix;
	if ( tracksUserType && tracksEventPrefix ) {
		clients.tracks = new Tracks( uuid, tracksUserType, tracksEventPrefix, env );
	}

	analytics = new Analytics( clients );

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
		const client = await getInstance();
		return await client.trackEvent( ...args );
	} catch ( e ) {
		debug( 'trackEvent() failed', e );
	}
}
