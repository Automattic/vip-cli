import debugLib from 'debug';
import { type Response } from 'undici';

import http from '../../../lib/api/http';
import { type Env } from '../../env';
import Token from '../../token';

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
	private readonly eventPrefix: string;
	private readonly userAgent: string;
	private readonly userId: string;
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

		debug( 'trackEvent()' );

		this.context = {
			...this.context,
			org_id: eventProps.org_slug,
			org_slug: eventProps.org_slug,
			org_sfid: eventProps.org_sfid,
			userAgent: this.userAgent,
			userId: this.userId,
		};

		try {
			return await this.send( eventName, eventProps );
		} catch {
			debug( 'Pendo event delivery failed' );
			return false;
		}
	}

	public async send(
		eventName: string,
		eventProps: Record< string, unknown >
	): Promise< Response > {
		const token = await Token.get();
		if ( ! token.raw ) {
			debug( 'Skipping Pendo event: authentication token unavailable' );
			throw new Error( 'Pendo authentication token unavailable' );
		}

		const body = {
			context: this.context,
			event: eventName,
			properties: eventProps,
			timestamp: Date.now(),
			type: 'track',
			visitorId: `${ this.context.userId as string }`,
			accountId: `${ this.context.org_sfid as string }`,
		};

		debug( 'send()' );

		const response = await http( Pendo.ENDPOINT, {
			method: 'POST',
			headers: { Authorization: `Bearer ${ token.raw }` },
			body: JSON.stringify( body ),
		} );

		await response.text();

		debug( 'Pendo response status=%d', response.status );
		if ( ! response.ok ) {
			throw new Error( `Pendo request failed with HTTP ${ response.status }` );
		}

		return response;
	}
}
