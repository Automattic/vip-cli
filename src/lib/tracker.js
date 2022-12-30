/**
 * External dependencies
 */
const debug = require( 'debug' )( '@automattic/vip:analytics' );

/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import Tracks from './analytics/clients/tracks';
import Pendo from './analytics/clients/pendo';
import Token from 'lib/token';
import config from 'lib/cli/config';
import env from './env';

let analytics = null;

async function init(): Promise<Analytics> {
	const uuid = await Token.uuid();

	const clients = [];

	const tracksUserType = config.tracksUserType;
	const tracksEventPrefix = config.tracksEventPrefix;

	if ( tracksUserType && tracksEventPrefix ) {
		clients.push( new Tracks( uuid, tracksUserType, tracksEventPrefix, env ) );

		clients.push( new Pendo( {
			env,
			eventPrefix: tracksEventPrefix,
			userId: uuid,
		} ) );
	}

	analytics = new Analytics( { clients } );

	return analytics;
}

async function getInstance(): Promise<Analytics> {
	if ( analytics ) {
		return analytics;
	}

	analytics = await init();

	return analytics;
}

export async function trackEvent( ...args ): Promise<Response> {
	try {
		await Token.uuid();
		const client = await getInstance();
		return await client.trackEvent( ...args );
	} catch ( err ) {
		debug( 'trackEvent() failed', err );
	}
}

export async function aliasUser( vipUserId ): Promise<Response> {
	try {
		if ( vipUserId ) {
			const prefixedVipUserId = `vip-${ vipUserId }`;
			await trackEvent( '_alias_user', { ui: prefixedVipUserId, _ut: config.tracksUserType, anonid: Token.uuid() } );
			Token.setUuid( prefixedVipUserId );
		}
	} catch ( err ) {
		debug( 'aliasUser() failed', err );
	}
}

export async function trackEventWithEnv( appId, envId, eventName, eventProps = {} ): Promise<Response> {
	return trackEvent( eventName, { ...eventProps, app_id: appId, env_id: envId } );
}
