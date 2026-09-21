import debugLib from 'debug';
import { inspect } from 'node:util';

import Pendo from '../../../../src/lib/analytics/clients/pendo';
import { API_HOST } from '../../../../src/lib/api/constants';
import * as apiHttp from '../../../../src/lib/api/http';
import env from '../../../../src/lib/env';
import Token from '../../../../src/lib/token';
import { getUndiciMockPool, resetUndiciMockAgent } from '../../../../test-utils/undici-mock';

describe( 'lib/analytics/pendo', () => {
	const pool = getUndiciMockPool( API_HOST );
	const namespace = '@automattic/vip:analytics:clients:pendo';
	const token = 'credential-sentinel';
	const properties = {
		org_slug: 'org-sentinel',
		org_sfid: 'account-sentinel',
		value: 'property-sentinel',
	};
	let originalNamespaces;
	let diagnosticOutput;
	let client;

	beforeEach( () => {
		originalNamespaces = debugLib.disable();
		debugLib.enable( namespace );
		diagnosticOutput = jest.spyOn( debugLib, 'log' ).mockImplementation( () => {} );
		jest.spyOn( Token, 'get' ).mockResolvedValue( { raw: token } );
		client = new Pendo( { userId: 'user-sentinel', eventPrefix: 'vip_', env } );
	} );

	afterEach( () => {
		resetUndiciMockAgent();
		debugLib.enable( originalNamespaces );
		jest.restoreAllMocks();
	} );

	const messages = () => inspect( diagnosticOutput.mock.calls );

	it( 'skips requests when no authentication token is available', async () => {
		Token.get.mockResolvedValue( { raw: '' } );
		const httpRequest = jest.spyOn( apiHttp, 'default' );

		await expect( client.trackEvent( 'command', properties ) ).resolves.toBe( false );

		expect( httpRequest ).not.toHaveBeenCalled();
		expect( messages() ).toContain( 'authentication token unavailable' );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it( 'uses current credentials on subsequent events', async () => {
		const authorization = [];
		for ( let eventIndex = 0; eventIndex < 2; eventIndex++ ) {
			pool.intercept( { method: 'POST', path: '/pendo' } ).reply( options => {
				authorization.push( options.headers.Authorization ?? options.headers.authorization );
				return { statusCode: 200, data: 'ok' };
			} );
		}

		await client.trackEvent( 'command' );
		Token.get.mockResolvedValue( { raw: 'refreshed-credential-sentinel' } );
		await client.trackEvent( 'command' );

		expect( authorization ).toEqual( [
			`Bearer ${ token }`,
			'Bearer refreshed-credential-sentinel',
		] );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it( 'sends the credential checked by the guard if the stored token disappears', async () => {
		Token.get.mockResolvedValueOnce( { raw: token } ).mockResolvedValueOnce( { raw: '' } );
		let authorization;
		pool.intercept( { method: 'POST', path: '/pendo' } ).reply( options => {
			authorization = options.headers.Authorization ?? options.headers.authorization;
			return { statusCode: 200, data: 'ok' };
		} );

		await client.trackEvent( 'command' );

		expect( authorization ).toBe( `Bearer ${ token }` );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it( 'sends the existing payload through the authenticated HTTP wrapper', async () => {
		let request;
		pool.intercept( { method: 'POST', path: '/pendo' } ).reply( options => {
			request = options;
			return { statusCode: 200, data: 'response-sentinel' };
		} );

		const response = await client.trackEvent( 'command', properties );

		expect( response.status ).toBe( 200 );
		expect( response.bodyUsed ).toBe( true );
		const headers = Object.fromEntries(
			Object.entries( request.headers ).map( ( [ key, value ] ) => [ key.toLowerCase(), value ] )
		);
		expect( headers.authorization ).toBe( `Bearer ${ token }` );
		expect( JSON.parse( request.body ) ).toEqual( {
			context: {
				...env,
				org_id: properties.org_slug,
				org_slug: properties.org_slug,
				org_sfid: properties.org_sfid,
				userId: 'user-sentinel',
			},
			event: 'vip_command',
			properties,
			timestamp: expect.any( Number ),
			type: 'track',
			visitorId: 'user-sentinel',
			accountId: 'account-sentinel',
		} );
		expect( messages() ).toContain( '200' );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it.each( [ 401, 403, 429, 500 ] )( 'reports HTTP %s as a best-effort failure', async status => {
		pool.intercept( { method: 'POST', path: '/pendo' } ).reply( status, 'response-sentinel' );

		await expect( client.trackEvent( 'command', properties ) ).resolves.toBe( false );

		expect( messages() ).toContain( String( status ) );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it( 'does not expose raw transport errors in diagnostics', async () => {
		pool
			.intercept( { method: 'POST', path: '/pendo' } )
			.replyWithError( new Error( 'transport-sentinel' ) );

		await expect( client.trackEvent( 'command', properties ) ).resolves.toBe( false );

		expect( messages() ).toContain( 'failed' );
		expect( messages() ).not.toMatch( /sentinel/u );
	} );

	it.each( [ '', 'unrelated', '*,-@automattic/vip:analytics:clients:pendo' ] )(
		'respects namespace selection %j',
		async namespaces => {
			debugLib.enable( namespaces );
			pool.intercept( { method: 'POST', path: '/pendo' } ).reply( 200, 'ok' );

			await client.trackEvent( 'command' );

			const pendoMessages = diagnosticOutput.mock.calls.filter( call =>
				String( call[ 0 ] ).includes( namespace )
			);
			expect( pendoMessages ).toEqual( [] );
		}
	);
} );
