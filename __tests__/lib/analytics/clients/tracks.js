/**
 * nock v14 Upgrade Compatibility Notes
 * =====================================
 *
 * This test suite was reviewed during the upgrade from nock v13.5.6 to v14.0.10.
 *
 * Breaking Changes in nock v14:
 * - Node.js requirement changed: v13 required >= 10.13, v14 requires >= 18.20.0
 * - Added native fetch support via @mswjs/interceptors
 * - Improved interception of both node-fetch and native fetch
 *
 * Analysis Result:
 * No test modifications were required. The existing test patterns are fully compatible
 * with nock v14 because:
 *
 * 1. Backward Compatibility: nock v14 maintains full API compatibility with v13
 *    - The existing nock().post().reply() pattern continues to work
 *    - Mock cleanup with nock.cleanAll() remains unchanged
 *    - Request interception for node-fetch works identically
 *
 * 2. Environment Requirements:
 *    - Project uses Node.js 20.19.5 (LTS), which meets v14's requirements
 *    - The Tracks client uses node-fetch, not native fetch
 *    - Global nock.disableNetConnect() in jest.setup.js continues to work
 *
 * 3. Why No Changes Were Needed:
 *    - The test uses standard nock patterns that are stable across versions
 *    - node-fetch interception is a core feature maintained in v14
 *    - No usage of deprecated APIs or edge-case behaviors
 *
 * Alternative Approaches Considered:
 *
 * A. Migrate to native fetch:
 *    - Pros: Modern API, built into Node.js 18+, no extra dependency
 *    - Cons: Would require changing production code in tracks.ts, more invasive
 *    - Decision: Not pursued - unnecessary code churn for working code
 *
 * B. Add explicit fetch interception setup:
 *    - Pros: Could be more explicit about what's being mocked
 *    - Cons: nock v14 handles this automatically, would add unnecessary complexity
 *    - Decision: Not needed - nock's automatic interception works correctly
 *
 * C. Switch to MSW (Mock Service Worker):
 *    - Pros: Modern, supports both Node and browser, works with fetch
 *    - Cons: Different API, would require rewriting all HTTP mocks
 *    - Decision: Excessive - nock v14 already provides fetch support
 *
 * Validation:
 * - All tests pass without modifications
 * - Full test suite runs successfully with nock v14.0.10
 * - No regressions in HTTP request mocking behavior
 *
 * Future Considerations:
 * - If migrating from node-fetch to native fetch in the future, these tests
 *   will continue to work without changes due to nock v14's fetch support
 * - Monitor for any issues with @mswjs/interceptors dependency updates
 */
import nock from 'nock';

import Tracks from '../../../../src/lib/analytics/clients/tracks';
import * as apiConfig from '../../../../src/lib/cli/apiConfig';

describe( 'lib/analytics/tracks', () => {
	const url = new URL( Tracks.ENDPOINT );

	const buildNock = () => nock( url.origin ).post( url.pathname );

	afterEach( nock.cleanAll );

	describe( '.send()', () => {
		it( 'should correctly construct remote request', () => {
			const tracksClient = new Tracks( 123, 'vip', '', {
				userAgent: 'vip-cli',
			} );

			const params = { extra: 'param' };

			const expectedBody =
				'commonProps%5B_ui%5D=123' +
				'&commonProps%5B_ut%5D=vip' +
				'&commonProps%5B_via_ua%5D=vip-cli' +
				'&extra=param';

			buildNock()
				// No arrow function because we need `this`
				.reply( 200, function ( uri, requestBody ) {
					expect( this.req.headers[ 'user-agent' ] ).toEqual( 'vip-cli' ); // The header value is returned as a string

					expect( requestBody ).toEqual( expectedBody );
				} );

			return tracksClient.send( params );
		} );
	} );

	describe( '.trackEvent()', () => {
		it( 'should pass event details to request', () => {
			const checkIfUserIsVipSpy = jest.spyOn( apiConfig, 'checkIfUserIsVip' );
			const tracksClient = new Tracks( 123, 'vip', 'prefix_', {} );

			const eventName = 'clickButton';
			const eventDetails = {
				buttonName: 'deploy',
			};

			checkIfUserIsVipSpy.mockResolvedValue( true );

			const expectedBodyMatch =
				'events%5B0%5D%5B_en%5D=prefix_clickButton' +
				'&events%5B0%5D%5BbuttonName%5D=deploy' +
				'&events%5B0%5D%5Bis_vip%5D=true';

			buildNock().reply( 200, ( uri, requestBody ) => {
				expect( requestBody ).toContain( expectedBodyMatch );
			} );

			return tracksClient.trackEvent( eventName, eventDetails );
		} );

		it( 'should ignore prefix if already set for event name', () => {
			const tracksClient = new Tracks( 123, 'vip', 'existingprefix_', {} );

			const eventName = 'existingprefix_clickButton';

			const expectedBodyMatch = 'events%5B0%5D%5B_en%5D=existingprefix_clickButton';

			buildNock().reply( 200, ( uri, requestBody ) => {
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
