/**
 * External dependencies
 */
import nock from 'nock';
import url from 'url';

/**
 * Internal dependencies
 */
import Tracks from 'lib/analytics/clients/tracks';

describe( 'lib/analytics/tracks', () => {
	const {
		protocol: endpointProtocol,
		host: endpointHost,
		path: endpointPath,
	} = url.parse( Tracks.ENDPOINT );

	const buildNock = () => {
		return nock( `${ endpointProtocol }//${ endpointHost }` )
			.post( endpointPath );
	};

	afterEach( nock.cleanAll );

	describe( '.send()', () => {
		/**
		 * Allow overriding of process variables per test
		 * Adapted from https://stackoverflow.com/a/48042799
		 */
		const OLD_ENV = process.env;

		beforeEach( () => {
			jest.resetModules();
			process.env = { ...OLD_ENV };
			delete process.env.DO_NOT_TRACK;
		} );

		afterEach( () => {
			process.env = OLD_ENV;
		} );

		it( 'should correctly construct remote request', () => {
			const tracksClient = new Tracks( 123, 'vip', '', {
				userAgent: 'vip-cli',
			} );

			const params = { extra: 'param' };

			const expectedBody = 'commonProps%5B_ui%5D=123' +
				'&commonProps%5B_ut%5D=vip' +
				'&commonProps%5B_via_ua%5D=vip-cli' +
				'&extra=param';

			buildNock()
				// No arrow function because we need `this`
				.reply( 200, function( uri, requestBody ) {
					expect( this.req.headers[ 'user-agent' ] )
						.toEqual( [ 'vip-cli' ] ); // The header value is returned as an array

					expect( requestBody ).toEqual( expectedBody );
				} );

			return tracksClient.send( params );
		} );

		it( 'should not send request when DO_NOT_TRACK is truthy', async () => {
			process.env.DO_NOT_TRACK = 1;

			const tracksClient = new Tracks( 123, 'vip', '', {
				userAgent: 'vip-cli',
			} );

			let fetchCalled = false;
			buildNock().reply( 200, () => fetchCalled = true );
			const result = await tracksClient.send( { extra: 'param' } );
			expect( fetchCalled ).toEqual( false );
			expect( result ).toEqual( 'tracks disabled per DO_NOT_TRACK variable' );
		} );
	} );

	describe( '.trackEvent()', () => {
		it( 'should pass event details to request', () => {
			const tracksClient = new Tracks( 123, 'vip', 'prefix_', {} );

			const eventName = 'clickButton';
			const eventDetails = {
				buttonName: 'deploy',
			};

			const expectedBodyMatch = 'events%5B0%5D%5B_en%5D=prefix_clickButton' +
				'&events%5B0%5D%5BbuttonName%5D=deploy';

			buildNock()
				.reply( 200, ( uri, requestBody ) => {
					expect( requestBody ).toContain( expectedBodyMatch );
				} );

			return tracksClient.trackEvent( eventName, eventDetails );
		} );

		it( 'should ignore prefix if already set for event name', () => {
			const tracksClient = new Tracks( 123, 'vip', 'existingprefix_', {} );

			const eventName = 'existingprefix_clickButton';

			const expectedBodyMatch = 'events%5B0%5D%5B_en%5D=existingprefix_clickButton';

			buildNock()
				.reply( 200, ( uri, requestBody ) => {
					expect( requestBody ).toContain( expectedBodyMatch );
				} );

			return tracksClient.trackEvent( eventName, {} );
		} );

		it( 'should not reject promise when tracking fails', async () => {
			const tracksClient = new Tracks( 123, 'vip', 'existingprefix_', {} );

			const eventName = 'existingprefix_clickButton';

			buildNock().replyWithError( 'Connection reset' );

			// We expect that the promise resolves to false instead of rejecting and throwing errors with async/await
			await expect( tracksClient.trackEvent( eventName, {} ) ).resolves.toBe( false );
		} );
	} );
} );
