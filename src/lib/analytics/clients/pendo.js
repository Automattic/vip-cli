// @flow

/**
 * External dependencies
 */
const debug = require( 'debug' )( '@automattic/vip:analytics:clients:pendo' );

/**
 * Internal dependencies
 */
import type { AnalyticsClient } from './client';
import API from 'lib/api';

/**
 * Pendo analytics client.
 */

export default class Pendo implements AnalyticsClient {
	eventPrefix: string;
	userAgent: string;
	userId: string;
	context: { [ key: string ]: string } = {};

	static get ENDPOINT() {
		return '/pendo';
	}

	constructor( {
		userId,
		eventPrefix,
		env,
	}: {
		userId: string,
		eventPrefix: string,
		env: { [ key: string ]: string }
	} ) {
		this.eventPrefix = eventPrefix;
		this.userAgent = env.userAgent;
		this.userId = userId;
		this.context = { ...env };
	}

	async trackEvent(
		eventName: string,
		eventProps: { [ key: string ]: string } = {}
	): Promise<any> {
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

	async send( eventName: string, eventProps: {} ): Promise<any> {
		const body = {
			accountId: this.context.accountId,
			context: this.context,
			event: eventName,
			properties: eventProps,
			timestamp: Date.now(),
			type: 'track',
			visitorId: `${ this.context.userId }`,
		};

		debug( 'send()', body );

		const { apiFetch } = await API();

		const response = await apiFetch( Pendo.ENDPOINT, {
			method: 'POST',
			body,
		} );

		const responseText = await response.text();

		debug( 'response', responseText );

		return responseText;
	}
}
