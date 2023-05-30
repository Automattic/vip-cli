/**
 * Internal dependencies
 */
import { Response } from 'node-fetch';
import type { AnalyticsClient } from './client';

export default class AnalyticsClientStub implements AnalyticsClient {
	trackEvent( _name: string, _props: Record<string, unknown> ): Promise<Response | false> {
		return Promise.resolve( false );
	}
}
