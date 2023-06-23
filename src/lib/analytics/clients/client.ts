import type { Response } from 'node-fetch';

export interface AnalyticsClient {
	trackEvent( name: string, props?: Record< string, unknown > ): Promise< Response | false >;
}
