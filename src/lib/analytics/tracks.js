/**
 * External dependencies
 */
import 'isomorphic-fetch';
import querystring from 'querystring';

/**
 * Simple class for tracking using Automattic Tracks.
 *
 * Implementation reference can be found in the Field Guide.
 */

// TODO: add batch support (can include multiples in `events` array)

export default class Tracks {
	static get ENDPOINT() {
		return 'https://public-api.wordpress.com/rest/v1.1/tracks/record?http_envelope=1';
	}

	constructor( userId, userType, env ) {
		this.userId = userId;
		this.userType = userType;

		this.baseParams = {
			'commonProps[_ui]': userId,
			'commonProps[_ut]': userType,
		};

		this.userAgent = env.userAgent;
	}

	trackEvent( name, details = {} ) {
		const event = Object.assign( {
			_en: name,
		}, details );

		const params = {
			events: [
				event,
			],
		};

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
