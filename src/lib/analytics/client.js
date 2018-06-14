export interface AnalyticsClient {
	trackEvent( name: string, props: object ): Promise<Response>;
}
