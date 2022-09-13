// @flow

/**
 * External dependencies
 */
const debug = require( 'debug' )( '@automattic/vip:analytics:clients:pendo' );

/**
 * Internal dependencies
 */
import http from 'lib/api/http';

/**
 * Pendo analytics client.
 */

export default class Pendo {
	eventPrefix;
	userAgent;
	userId;
	context = {};

	static get ENDPOINT() {
		return '/pendo';
	}

	constructor( {
		userId,
		eventPrefix,
		env,
	} ) {
		this.eventPrefix = eventPrefix;
		this.userAgent = env.userAgent;
		this.userId = userId;
		this.context = { ...env };
	}

	async trackEvent(
		eventName,
		eventProps = {}
	) {
		if ( ! eventName.startsWith( this.eventPrefix ) ) {
			eventName = this.eventPrefix + eventName;
		}

		debug( 'trackEvent()', eventProps );

		this.context = {
			...this.context,
			org_id: eventProps.org_slug,
			org_slug: eventProps.org_slug,
			userAgent: this.userAgent,
			userId: this.userId,
		};

		try {
			return await this.send( eventName, eventProps );
		} catch ( error ) {
			debug( error );
		}

		// Resolve to false instead of rejecting
		return Promise.resolve( false );
	}

	async send( eventName, eventProps ) {
		const body = {
			context: this.context,
			event: eventName,
			properties: eventProps,
			timestamp: Date.now(),
			type: 'track',
			visitorId: `${ this.context.userId }`,
		};

		debug( 'send()', body );

		const response = await http( Pendo.ENDPOINT, {
			method: 'POST',
			body,
		} );

		const responseText = await response.text();

		debug( 'response', responseText );

		return responseText;
	}
}
