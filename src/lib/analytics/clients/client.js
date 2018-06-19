export interface AnalyticsClient {
	trackEvent( name: string, props: {} ): Promise<Response>;
}
