import { afterEach, describe, expect, it, jest } from '@jest/globals';

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

		it( 'should send events to the client with client info', async () => {
			delete process.env.DO_NOT_TRACK;
			const stubClient = new AnalyticsClientStub();
			const stubClientSpy = jest.spyOn( stubClient, 'trackEvent' );
			const analytics = new Analytics( stubClient );

			const result = analytics.trackEvent( 'test_event', { foo: 'bar' } );

			await expect( result ).resolves.toBe( false );
			expect( stubClientSpy ).toHaveBeenCalledWith(
				'test_event',
				expect.objectContaining( {
					cli_version: expect.any( String ),
					os_name: expect.any( String ),
					os_version: expect.any( String ),
					os_arch: expect.any( String ),
					node_version: expect.any( String ),
					foo: 'bar',
				} )
			);
		} );

		it( 'should not track events when DO_NOT_TRACK is set', async () => {
			process.env.DO_NOT_TRACK = 1;

			const stubClient = new AnalyticsClientStub();
			const stubClientSpy = jest.spyOn( stubClient, 'trackEvent' );
			const analytics = new Analytics( stubClient );

			const result = analytics.trackEvent( 'test_event', {} );

			await expect( result ).resolves.toBe( false );
			expect( stubClientSpy ).toHaveBeenCalledTimes( 0 );
		} );
	} );
} );
