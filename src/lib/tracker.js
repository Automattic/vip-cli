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
	await Token.uuid();
	try {
		const client = await getInstance();
		return client.trackEvent( ...args );
	} catch ( err ) {
		debug( 'trackEvent() failed', err );
	}
}

export async function aliasUser( vipUserId ): Promise<Response> {
	try {
		if ( vipUserId ) {
			await trackEvent( '_alias_user', { ui: vipUserId, _ut: config.tracksUserType, anonid: Token.uuid() } );
			Token.setUuid( vipUserId );
		}
	} catch ( err ) {
		debug( 'aliasUser() failed', err );
	}
}

export async function trackEventWithEnv( appId, envId, eventName, eventProps = {} ): Promise<Response> {
	return trackEvent( eventName, { ...eventProps, app_id: appId, env_id: envId } );
}
