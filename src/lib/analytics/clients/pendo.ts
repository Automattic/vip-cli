import debugLib from 'debug';
import { Response } from 'node-fetch';

import http from '../../../lib/api/http';
import { type Env } from '../../env';

import type { AnalyticsClient } from './client';

const debug = debugLib( '@automattic/vip:analytics:clients:pendo' );

interface PendoOptions {
	userId: string;
	eventPrefix: string;
	env: Env;
}

/**
 * Pendo analytics client.
 */
export default class Pendo implements AnalyticsClient {
	private eventPrefix: string;
	private userAgent: string;
	private userId: string;
	private context: Env & Record< string, unknown > & { userId?: string };

	public static readonly ENDPOINT = '/pendo';

	constructor( options: PendoOptions ) {
		this.eventPrefix = options.eventPrefix;
		this.userAgent = options.env.userAgent;
		this.userId = options.userId;
		this.context = { ...options.env };
	}

	public async trackEvent(
		eventName: string,
		eventProps: Record< string, unknown > = {}
	): Promise< Response | false > {
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
			return Promise.resolve( false );
		}
	}

	public async send(
		eventName: string,
		eventProps: Record< string, unknown >
	): Promise< Response > {
		const body = {
			context: this.context,
			event: eventName,
			properties: eventProps,
			timestamp: Date.now(),
			type: 'track',
			visitorId: `${ this.context.userId as string }`,
		};

		debug( 'send()', body );

		const response = await http( Pendo.ENDPOINT, {
			method: 'POST',
			body: JSON.stringify( body ),
		} );

		const responseText = await response.text();

		debug( 'response', responseText );

		return response;
	}
}
