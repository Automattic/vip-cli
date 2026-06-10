import type { Response } from 'undici';

export interface AnalyticsClient {
	trackEvent( name: string, props?: Record< string, unknown > ): Promise< Response | false >;
}
