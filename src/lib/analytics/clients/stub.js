/**
 * Internal dependencies
 */
import type { AnalyticsClient } from './client';

export default class AnalyticsClientStub implements AnalyticsClient {
	// eslint-disable-next-line no-unused-vars
	trackEvent( name: string, props: {} ): Promise<Response> {
		return new Promise( resolve => resolve( true ) );
	}
}
