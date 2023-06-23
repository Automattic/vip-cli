/**
 * External dependencies
 */
import fetch, { type Response } from 'node-fetch';
import querystring from 'querystring';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import type { AnalyticsClient } from './client';
import { checkIfUserIsVip } from '../../cli/apiConfig';
import type { Env } from '../../env';

const debug = debugLib( '@automattic/vip:analytics:clients:tracks' );

const validEventOrPropNamePattern = /^[a-z_][a-z0-9_]*$/;

interface BaseParams {
	'commonProps[_ui]': string;
	'commonProps[_ut]': string;
	'commonProps[_via_ua]': string;
}

/**
 * Simple class for tracking using Automattic Tracks.
 *
 * Implementation reference can be found in the Field Guide.
 */

// TODO: add batch support (can include multiples in `events` array)

export default class Tracks implements AnalyticsClient {
	private eventPrefix: string;
	private userAgent: string;
	private baseParams: BaseParams;

	static readonly ENDPOINT = 'https://public-api.wordpress.com/rest/v1.1/tracks/record';

	constructor( userId: string, userType: string, eventPrefix: string, env: Env ) {
		this.eventPrefix = eventPrefix;

		this.userAgent = env.userAgent;

		this.baseParams = {
			'commonProps[_ui]': userId,
			'commonProps[_ut]': userType,
			'commonProps[_via_ua]': this.userAgent,
		};
	}

	async trackEvent(
		name: string,
		eventProps: Record< string, unknown > = {}
	): Promise< Response | false > {
		if ( ! name.startsWith( this.eventPrefix ) ) {
			name = this.eventPrefix + name;
		}

		if ( ! validEventOrPropNamePattern.test( name ) ) {
			debug(
				`Error: Invalid event name detected: ${ name } -- this event will be rejected during ETL`
			);
		}

		Object.keys( eventProps ).forEach( propName => {
			if ( ! validEventOrPropNamePattern.test( propName ) ) {
				debug(
					`Error: Invalid prop name detected: ${ propName } -- this event will be rejected during ETL`
				);
			}
		} );

		eventProps.is_vip = await checkIfUserIsVip(); // Add `is_vip` flag to every Tracks event recorded

		const event: Record< string, unknown > = {
			_en: name,
			...eventProps,
		};

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
		return false;
	}

	send( extraParams: Record< string, unknown > ): Promise< Response > {
		const params = { ...this.baseParams, ...extraParams };

		const method = 'POST';
		const body = querystring.stringify( params );
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': this.userAgent,
		};

		debug( 'send()', body );

		return fetch( Tracks.ENDPOINT, {
			method,
			body,
			headers,
		} );
	}
}
