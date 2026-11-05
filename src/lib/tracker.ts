import debugLib from 'debug';

import Tracks from './analytics/clients/tracks';
import Analytics from './analytics/index';
import env from './env';
import config from '../lib/cli/config';
import Token from '../lib/token';

import type { Response } from 'undici';

const debug = debugLib( '@automattic/vip:analytics' );

let analytics: Analytics | null = null;

async function init(): Promise< Analytics | null > {
	const uuid = await Token.uuid();

	const tracksUserType = config.tracksUserType;
	const tracksEventPrefix = config.tracksEventPrefix;

	if ( ! tracksUserType || ! tracksEventPrefix ) {
		return null;
	}

	return new Analytics( new Tracks( uuid, tracksUserType, tracksEventPrefix, env ) );
}

async function getInstance(): Promise< Analytics | null > {
	if ( analytics ) {
		return analytics;
	}

	analytics = await init();

	return analytics;
}

export async function trackEvent(
	name: string,
	props: Record< string, unknown > = {}
): Promise< Response | false > {
	try {
		await Token.uuid();
		const client = await getInstance();
		return client ? await client.trackEvent( name, props ) : false;
	} catch ( err ) {
		debug( 'trackEvent() failed', err );
		return false;
	}
}

export async function aliasUser( vipUserId: number ): Promise< void > {
	if ( vipUserId ) {
		try {
			await trackEvent( '_alias_user', {
				ui: vipUserId,
				_ut: config.tracksUserType,
				anonid: await Token.uuid(),
			} );
			await Token.setUuid( `${ vipUserId }` );
		} catch ( err ) {
			debug( 'aliasUser() failed', err );
		}
	}
}

export function trackEventWithEnv(
	appId: string | number,
	envId: string | number,
	eventName: string,
	eventProps: Record< string, unknown > = {}
): Promise< Response | false > {
	return trackEvent( eventName, { ...eventProps, app_id: appId, env_id: envId } );
}

export type CommandTracker = ( type: string, data?: Record< string, unknown > ) => Promise< void >;

export function makeCommandTracker(
	command: string,
	trackingInfo: Record< string, unknown > = {}
): CommandTracker {
	const trackerFn = async ( type: string, data: Record< string, unknown > = {} ) => {
		await trackEvent( `${ command }_command_${ type }`, { ...trackingInfo, ...data } );
	};

	return trackerFn;
}
