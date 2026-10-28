import Tracks from '../../../../src/lib/analytics/clients/tracks';
import * as apiConfig from '../../../../src/lib/cli/apiConfig';
import { getUndiciMockPool, resetUndiciMockAgent } from '../../../../test-utils/undici-mock';

describe( 'lib/analytics/tracks', () => {
	const url = new URL( Tracks.ENDPOINT );
	const pool = getUndiciMockPool( url.origin );

	const buildMockRequest = () => pool.intercept( { method: 'POST', path: url.pathname } );

	afterEach( resetUndiciMockAgent );

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

			buildMockRequest().reply( options => {
				const headers = Object.fromEntries(
					Object.entries( options.headers ?? {} ).map( ( [ key, value ] ) => [
						key.toLowerCase(),
						String( value ),
					] )
				);

				expect( headers[ 'user-agent' ] ).toEqual( 'vip-cli' );
				expect( String( options.body ) ).toEqual( expectedBody );

				return {
					statusCode: 200,
					data: 'ok',
				};
			} );

			return tracksClient.send( params );
		} );
	} );

	describe( '.trackEvent()', () => {
		it( 'should pass event details to request', async () => {
			const checkIfUserIsVipSpy = jest.spyOn( apiConfig, 'checkIfUserIsVip' );
			const tracksClient = new Tracks( 123, 'vip', 'prefix_', {} );

			const eventName = 'clickButton';
			const eventDetails = {
				buttonName: 'deploy',
			};

			checkIfUserIsVipSpy.mockResolvedValue( true );

			let requestBody;
			buildMockRequest().reply( options => {
				requestBody = String( options.body );

				return {
					statusCode: 200,
					data: 'ok',
				};
			} );

			const response = await tracksClient.trackEvent( eventName, eventDetails );
			expect( response.status ).toBe( 200 );
			const eventParams = [ ...new URLSearchParams( requestBody ) ].filter( ( [ key ] ) =>
				key.startsWith( 'events[' )
			);
			expect( eventParams ).toEqual( [
				[ 'events[0][_en]', 'prefix_clickButton' ],
				[ 'events[0][buttonName]', 'deploy' ],
				[ 'events[0][is_vip]', 'true' ],
			] );
		} );

		it( 'should ignore prefix if already set for event name', async () => {
			const tracksClient = new Tracks( 123, 'vip', 'existingprefix_', {} );

			const eventName = 'existingprefix_clickButton';

			let requestBody;
			buildMockRequest().reply( options => {
				requestBody = String( options.body );

				return {
					statusCode: 200,
					data: 'ok',
				};
			} );

			const response = await tracksClient.trackEvent( eventName, {} );
			expect( response.status ).toBe( 200 );
			const eventParams = [ ...new URLSearchParams( requestBody ) ].filter( ( [ key ] ) =>
				key.startsWith( 'events[' )
			);
			expect( eventParams ).toEqual( [
				[ 'events[0][_en]', 'existingprefix_clickButton' ],
				[ 'events[0][is_vip]', 'true' ],
			] );
		} );

		it( 'should not reject promise when tracking fails', async () => {
			const tracksClient = new Tracks( 123, 'vip', 'existingprefix_', {} );

			const eventName = 'existingprefix_clickButton';

			buildMockRequest().replyWithError( 'Connection reset' );

			// We expect that the promise resolves to false instead of rejecting and throwing errors with async/await
			await expect( tracksClient.trackEvent( eventName, {} ) ).resolves.toBe( false );
		} );
	} );
} );
