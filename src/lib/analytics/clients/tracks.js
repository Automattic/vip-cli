// @flow

/**
 * External dependencies
 */
import fetch from 'node-fetch';
import querystring from 'querystring';
const debug = require( 'debug' )( '@automattic/vip:analytics:clients:tracks' );

/**
 * Internal dependencies
 */
import type { AnalyticsClient } from './client';
import { checkIsVIP } from '../../cli/apiConfig';

const validEventOrPropNamePattern = /^[a-z_][a-z0-9_]*$/;

/**
 * Simple class for tracking using Automattic Tracks.
 *
 * Implementation reference can be found in the Field Guide.
 */

// TODO: add batch support (can include multiples in `events` array)

export default class Tracks implements AnalyticsClient {
	eventPrefix: string;
	userAgent: string;
	baseParams: {
		'commonProps[_ui]': string,
		'commonProps[_ut]': string,
	};

	static get ENDPOINT() {
		return 'https://public-api.wordpress.com/rest/v1.1/tracks/record';
	}

	constructor( userId: string, userType: string, eventPrefix: string, env: {} ) {
		this.eventPrefix = eventPrefix;

		this.userAgent = env.userAgent;

		this.baseParams = {
			'commonProps[_ui]': userId,
			'commonProps[_ut]': userType,
			'commonProps[_via_ua]': this.userAgent,
		};
	}

	async trackEvent( name: string, eventProps = {} ): Promise<any> {
		if ( ! name.startsWith( this.eventPrefix ) ) {
			name = this.eventPrefix + name;
		}

		if ( ! validEventOrPropNamePattern.test( name ) ) {
			debug( `Error: Invalid event name detected: ${ name } -- this event will be rejected during ETL` );
		}

		Object.keys( eventProps ).forEach( propName => {
			if ( ! validEventOrPropNamePattern.test( propName ) ) {
				debug( `Error: Invalid prop name detected: ${ propName } -- this event will be rejected during ETL` );
			}
		} );

		const event = Object.assign( {
			_en: name,
			is_vip: await checkIsVIP(),	// Add `is_vip` flag to every Tracks event recorded
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

		debug( 'trackEvent()', params );

		try {
			return await this.send( params );
		} catch ( error ) {
			debug( error );
		}

		// Resolve to false instead of rejecting
		return Promise.resolve( false );
	}

	send( extraParams: {} ): Promise<any> {
		if ( process.env.DO_NOT_TRACK ) {
			debug( 'send() => skipping per DO_NOT_TRACK variable' );

			return Promise.resolve( 'tracks disabled per DO_NOT_TRACK variable' );
		}

		const params = Object.assign( {}, this.baseParams, extraParams );

		const method = 'POST';
		const body = querystring.stringify( params );
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': this.userAgent,
		};

		debug( 'send()', body );

		// eslint-disable-next-line no-undef
		return fetch( Tracks.ENDPOINT, {
			method,
			body,
			headers,
		} );
	}
}
