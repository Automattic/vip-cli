import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import http from '../../../src/lib/api/http';
import * as client from '../../../src/lib/rechallenge/client';
import { RechallengeHttpError } from '../../../src/lib/rechallenge/errors';

jest.mock( '../../../src/lib/api/http' );
const mockHttp = http as unknown as jest.Mock;

function jsonResponse( status: number, body: unknown ) {
	return Promise.resolve( {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve( body ),
		text: () => Promise.resolve( JSON.stringify( body ) ),
	} as unknown as Response );
}

describe( 'rechallenge client.createSession', () => {
	beforeEach( () => mockHttp.mockReset() );

	it( 'POSTs the create-session path with clientType and requestedOperation', async () => {
		mockHttp.mockReturnValueOnce(
			jsonResponse( 201, {
				challengeId: 'rch_abc',
				status: 'pending',
				verificationUrl: 'https://example.com/verify',
				pollIntervalSeconds: 2,
				expiresAt: new Date( Date.now() + 900_000 ).toISOString(),
			} )
		);

		const session = await client.createSession( {
			path: '/rechallenge/v2/sessions',
			requestedOperation: 'updateDefensiveModeStatus',
		} );

		expect( mockHttp ).toHaveBeenCalledTimes( 1 );
		const [ path, options ] = mockHttp.mock.calls[ 0 ] as [ string, Record< string, unknown > ];
		expect( path ).toBe( '/rechallenge/v2/sessions' );
		expect( options.method ).toBe( 'POST' );
		const headers = options.headers as Record< string, string >;
		expect( headers[ 'Idempotency-Key' ] ).toMatch( /^[a-f0-9-]{36}$/ );
		expect( options.body ).toEqual( {
			clientType: 'cli',
			requestedOperation: 'updateDefensiveModeStatus',
		} );
		expect( session.challengeId ).toBe( 'rch_abc' );
	} );

	it( 'throws RechallengeHttpError on non-2xx', async () => {
		mockHttp.mockReturnValueOnce( jsonResponse( 500, { message: 'boom' } ) );
		await expect(
			client.createSession( {
				path: '/rechallenge/v2/sessions',
				requestedOperation: 'updateDefensiveModeStatus',
			} )
		).rejects.toBeInstanceOf( RechallengeHttpError );
	} );
} );

describe( 'rechallenge client.getSessionStatus', () => {
	beforeEach( () => mockHttp.mockReset() );

	it( 'GETs the status template with challengeId substituted', async () => {
		mockHttp.mockReturnValueOnce(
			jsonResponse( 200, {
				challengeId: 'rch_abc',
				status: 'verified',
				expiresAt: new Date().toISOString(),
				pollIntervalSeconds: 2,
				provider: 'passkeys',
			} )
		);
		const status = await client.getSessionStatus( {
			template: '/rechallenge/v2/sessions/{challengeId}',
			challengeId: 'rch_abc',
		} );
		expect( mockHttp ).toHaveBeenCalledWith(
			'/rechallenge/v2/sessions/rch_abc',
			expect.objectContaining( { method: 'GET' } )
		);
		expect( status.status ).toBe( 'verified' );
	} );

	it( 'throws RechallengeHttpError on non-2xx', async () => {
		mockHttp.mockReturnValueOnce( jsonResponse( 404, { message: 'not found' } ) );
		await expect(
			client.getSessionStatus( {
				template: '/rechallenge/v2/sessions/{challengeId}',
				challengeId: 'rch_abc',
				scope: 'updateDefensiveModeStatus',
			} )
		).rejects.toBeInstanceOf( RechallengeHttpError );
	} );
} );

describe( 'rechallenge client.exchange', () => {
	beforeEach( () => mockHttp.mockReset() );

	it( 'POSTs the exchange template and returns elevatedToken', async () => {
		mockHttp.mockReturnValueOnce(
			jsonResponse( 200, {
				elevatedToken: {
					token: 'jwt.payload.sig',
					expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
					purpose: 'validate-elevated-permissions',
				},
			} )
		);
		const exchange = await client.exchange( {
			template: '/rechallenge/v2/sessions/{challengeId}/exchange',
			challengeId: 'rch_abc',
		} );
		expect( mockHttp ).toHaveBeenCalledWith(
			'/rechallenge/v2/sessions/rch_abc/exchange',
			expect.objectContaining( { method: 'POST' } )
		);
		expect( exchange.elevatedToken.token ).toBe( 'jwt.payload.sig' );
	} );

	it( 'throws RechallengeHttpError with bodyText on non-2xx', async () => {
		mockHttp.mockReturnValueOnce( jsonResponse( 401, { message: 'unauthorized' } ) );
		const promise = client.exchange( {
			template: '/rechallenge/v2/sessions/{challengeId}/exchange',
			challengeId: 'rch_abc',
			scope: 'updateDefensiveModeStatus',
		} );
		await expect( promise ).rejects.toBeInstanceOf( RechallengeHttpError );
		await expect( promise ).rejects.toMatchObject( {
			statusCode: 401,
			bodyText: expect.stringContaining( 'unauthorized' ),
		} );
	} );
} );
