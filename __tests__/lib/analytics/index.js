/**
 * Internal dependencies
 */
import Analytics from 'lib/analytics';
import AnalyticsClientStub from 'lib/analytics/clients/stub';

describe( 'lib/analytics', () => {
	describe( '.trackEvent()', () => {
		const OLD_ENV = process.env;

		afterEach( () => {
			process.env = OLD_ENV;
		} );

		it( 'should track events for all clients', async () => {
			const stubClient1 = new AnalyticsClientStub();
			const stubClient1Spy = jest.spyOn( stubClient1, 'trackEvent' );
			const stubClient2 = new AnalyticsClientStub();
			const stubClient2Spy = jest.spyOn( stubClient2, 'trackEvent' );
			const analytics = new Analytics( {
				clients: [
					stubClient1,
					stubClient2,
				],
			} );

			const result = analytics.trackEvent( 'test_event', {} );

			await expect( result ).resolves.toStrictEqual( [ true, true ] );
			expect( stubClient1Spy ).toHaveBeenCalledTimes( 1 );
			expect( stubClient2Spy ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should not track events when DO_NOT_TRACK is set', async () => {
			process.env.DO_NOT_TRACK = 1;

			const stubClient = new AnalyticsClientStub();
			const stubClientSpy = jest.spyOn( stubClient, 'trackEvent' );
			const analytics = new Analytics( {
				clients: [
					stubClient,
				],
			} );

			const result = analytics.trackEvent( 'test_event', {} );

			await expect( result ).resolves.toBe( 'Skipping trackEvent for test_event (DO_NOT_TRACK)' );
			expect( stubClientSpy ).toHaveBeenCalledTimes( 0 );
		} );
	} );
} );
