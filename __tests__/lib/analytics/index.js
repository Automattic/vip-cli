/**
 * External dependencies
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import Analytics from '../../../src/lib/analytics';

class AnalyticsClientStub {
	trackEvent() {
		return Promise.resolve( false );
	}
}

describe( 'lib/analytics', () => {
	describe( '.trackEvent()', () => {
		const OLD_ENV = process.env;

		afterEach( () => {
			process.env = OLD_ENV;
		} );

		it( 'should track events for all clients', async () => {
			delete process.env.DO_NOT_TRACK;
			const stubClient1 = new AnalyticsClientStub();
			const stubClient1Spy = jest.spyOn( stubClient1, 'trackEvent' );
			const stubClient2 = new AnalyticsClientStub();
			const stubClient2Spy = jest.spyOn( stubClient2, 'trackEvent' );
			const analytics = new Analytics( [ stubClient1, stubClient2 ] );

			const result = analytics.trackEvent( 'test_event', {} );

			await expect( result ).resolves.toStrictEqual( [ false, false ] );
			expect( stubClient1Spy ).toHaveBeenCalledTimes( 1 );
			expect( stubClient2Spy ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should not track events when DO_NOT_TRACK is set', async () => {
			process.env.DO_NOT_TRACK = 1;

			const stubClient = new AnalyticsClientStub();
			const stubClientSpy = jest.spyOn( stubClient, 'trackEvent' );
			const analytics = new Analytics( [ stubClient ] );

			const result = analytics.trackEvent( 'test_event', {} );

			await expect( result ).resolves.toStrictEqual( [] );
			expect( stubClientSpy ).toHaveBeenCalledTimes( 0 );
		} );
	} );
} );
