/**
 * Internal dependencies
 */

export default class AnalyticsClientStub {
	// eslint-disable-next-line no-unused-vars
	trackEvent( name, props ) {
		return new Promise( resolve => resolve( true ) );
	}
}
