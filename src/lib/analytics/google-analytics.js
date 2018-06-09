/**
 * External dependencies
 */
import 'isomorphic-fetch';
import querystring from 'querystring';

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

export default class GoogleAnalytics {
	static get ENDPOINT() {
		return 'https://www.google-analytics.com/collect';
	}

	constructor( accountId, userId, env ) {
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

	// Name and category are both required; others are optional
	trackEvent( name, { category, label = null, value = null } ) {
		const params = {
			t: 'event', // hit type
			ea: name, // "action"
			ec: category,
		};

		if ( label ) {
			params.el = label;
		}

		if ( value ) {
			params.ev = value;
		}

		return this.send( params );
	}

	send( extraParams ) {
		const params = Object.assign( {}, this.baseParams, extraParams );

		const method = 'POST';
		const body = querystring.stringify( params );
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': this.userAgent,
		};

		return fetch( this.ENDPOINT, {
			method,
			body,
			headers,
		} );
	}
}
