/**
 * External dependencies
 */
import nock from 'nock';
import url from 'url';

/**
 * Internal dependencies
 */
import GoogleAnalytics from 'lib/analytics/clients/google-analytics';

describe( 'lib/analytics/google-analytics', () => {
	const {
		protocol: endpointProtocol,
		host: endpointHost,
		path: endpointPath
	} = url.parse( GoogleAnalytics.ENDPOINT );

	const env = {
		app: {
			name: 'vip',
			version: '1.0',
		},
		userAgent: 'vip-cli'
	};

	const buildNock = () => {
		return nock( `${ endpointProtocol }//${ endpointHost }` )
			.post( endpointPath );
	};

	afterEach( nock.cleanAll );

	describe( '.send()', () => {
		it( 'should correctly construct remote request', () => {
			const gaClient = new GoogleAnalytics( 'UA-123', 456, env );

			const params = { extra: 'param' };

			const expectedBody = 'v=1' +
				'&tid=UA-123' +
				'&cid=456' +
				'&aip=1' +
				'&ds=cli' +
				'&an=vip' +
				'&av=1.0' +
				'&extra=param';

			buildNock()
				// No arrow function because we need `this`
				.reply( function( uri, requestBody ) {
					expect( this.req.headers[ 'user-agent' ] )
						.toEqual( [ 'vip-cli' ] ); // The header value is returned as an array

					expect( requestBody ).toEqual( expectedBody );
				} );

			return gaClient.send( params );
		} );
	} );

	describe( '.trackEvent()', () => {
		it( 'should pass minimum event details to request', () => {
			const gaClient = new GoogleAnalytics( 'UA-123', 456, env );

			const eventName = 'clickButton';
			const eventDetails = {
				category: 'cat',
			};

			const expectedBodyMatch = '&t=event' +
				'&ea=clickButton' +
				'&ec=cat';

			buildNock()
				.reply( ( uri, requestBody ) => {
					expect( requestBody ).toContain( expectedBodyMatch );
				} );

			return gaClient.trackEvent( eventName, eventDetails );
		} );

		it( 'should pass all event details to request', () => {
			const gaClient = new GoogleAnalytics( 'UA-123', 456, env );

			const eventName = 'clickButton';
			const eventDetails = {
				category: 'cat',
				label: 'lab',
				value: 1,
			};

			const expectedBodyMatch = '&t=event' +
				'&ea=clickButton' +
				'&ec=cat' +
				'&el=lab' +
				'&ev=1';

			buildNock()
				.reply( ( uri, requestBody ) => {
					expect( requestBody ).toContain( expectedBodyMatch );
				} );

			return gaClient.trackEvent( eventName, eventDetails );
		} );
	} );
} );
