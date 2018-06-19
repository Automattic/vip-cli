// @flow

/**
 * External dependencies
 */
import 'isomorphic-fetch';
import querystring from 'querystring';
const debug = require( 'debug' )( '@automattic/vip:analytics:clients:google' );

/**
 * Internal dependencies
 */
import type { AnalyticsClient } from './client';

/**
 * Simple class for tracking using Google Analytics Measurement Protocol.
 *
 * Implementation reference:
 *
 * - https://developers.google.com/analytics/devguides/collection/protocol/v1/reference
 */

// TODO: add batch support; queue data
// TODO: add time tracking (can set `plt: 1012` with value as the time in milliseconds)
// TODO: add error tracking (can set `exd: ''` [description of error; e.g. DatabaseError] and `exf: 0` [either 0|1 <not fatal|fatal>])

export default class GoogleAnalytics implements AnalyticsClient {
	accountId: string;
	userId: string;
	baseParams: {};
	userAgent: string;

	static get ENDPOINT() {
		return 'https://www.google-analytics.com/collect';
	}

	constructor( accountId: string, userId: string, env: {} ) {
		this.accountId = accountId;
		this.userId = userId;

		this.baseParams = {
			v: 1, // version
			tid: accountId, // Google Analytics ID; i.e. `UA-12345`
			cid: userId, // Unique ID for the user
			aip: 1, // anonymize IP

			ds: 'cli', // data source
			an: env.app.name, // application name
			av: env.app.version, // application version
		};

		this.userAgent = env.userAgent;
	}

	// `name` and `category` are both required; others are optional
	trackEvent( name: string, props: {} ): Promise<Response> {
		const params = {
			t: 'event', // hit type
			ea: name, // "action"
			ec: 'CLI',
		};

		let customPropIndex = 1;
		Object.entries( props ).forEach( entry => {
			const [ key, value ] = entry;

			if ( key === 'category' ) {
				params.ec = value;
			} else if ( key === 'label' ) {
				params.el = value;
			} else if ( key === 'value' ) {
				params.ev = value;
			} else if ( key === 'error' ) {
				params.exd = value;
			} else {
				params[ `cd${ customPropIndex }` ] = key;
				params[ `cm${ customPropIndex }` ] = value;
				customPropIndex++;
			}
		} );

		debug( 'trackEvent()', params );

		return this.send( params );
	}

	send( extraParams: {} ): Promise<Response> {
		const params = Object.assign( {}, this.baseParams, extraParams );

		const method = 'POST';
		const body = querystring.stringify( params );
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': this.userAgent,
		};

		debug( 'send()', body );

		return fetch( GoogleAnalytics.ENDPOINT, {
			method,
			body,
			headers,
		} );
	}
}
