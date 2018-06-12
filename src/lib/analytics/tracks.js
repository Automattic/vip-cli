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
		return 'https://public-api.wordpress.com/rest/v1.1/tracks/record';
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

	trackEvent( name, eventProps = {} ) {
		const event = Object.assign( {
			_en: name,
		}, eventProps );

		// For when we want to support batched events
		const events = [ event ];

		/**
		 * The API expects an indexed events array with event data.
		 *
		 * `querystring.stringify` does not handle nested arrays and objects very well.
		 *
		 * So we can just do it ourselves instead.
		 *
		 * Should end up with something like:
		 *  - events[0][_en]=clickButton // event name
		 *  - events[0][buttonName]=Deploy // event custom prop
		 *  - events[1][_en]=loadPage
		 */
		const params = events.reduce( ( reduced, ev, index ) => {
			Object.keys( ev ).forEach( key => {
				const param = `events[${ index }][${ key }]`;
				const value = event[ key ];

				reduced[ param ] = value;
			} );

			return reduced;
		}, {} );

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

		return fetch( Tracks.ENDPOINT, {
			method,
			body,
			headers,
		} );
	}
}
