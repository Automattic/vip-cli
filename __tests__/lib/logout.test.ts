import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import http from '../../src/lib/api/http';
import logout from '../../src/lib/logout';
import tokenCache from '../../src/lib/rechallenge/token-cache';
import Token from '../../src/lib/token';
import { trackEvent } from '../../src/lib/tracker';

import type { Response } from 'undici';

jest.mock( '../../src/lib/api/http', () => ( {
	__esModule: true,
	default: jest.fn(),
} ) );

jest.mock( '../../src/lib/token', () => ( {
	__esModule: true,
	default: {
		get: jest.fn( () => Promise.resolve( { valid: () => true } ) ),
		purge: jest.fn( () => Promise.resolve( true ) ),
	},
} ) );

jest.mock( '../../src/lib/rechallenge/token-cache', () => ( {
	__esModule: true,
	default: {
		get: jest.fn(),
		set: jest.fn(),
		clearScope: jest.fn(),
		clearAll: jest.fn( () => Promise.resolve() ),
	},
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( () => Promise.resolve() ),
} ) );

const mockHttpApiFn = jest.mocked( http );
/* eslint-disable @typescript-eslint/unbound-method */
const mockTokenGetFn = jest.mocked( Token.get );
const mockTokenPurgeFn = jest.mocked( Token.purge );
/* eslint-enable @typescript-eslint/unbound-method */

describe( 'logout', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		mockTokenGetFn.mockResolvedValue( { valid: () => true } as InstanceType< typeof Token > );
		mockTokenPurgeFn.mockResolvedValue( true );
	} );

	it( 'purges primary token, clears elevated-token cache, and emits telemetry', async () => {
		mockHttpApiFn.mockResolvedValueOnce( { ok: true } as unknown as Response );
		await logout();
		expect( mockHttpApiFn ).toHaveBeenCalledTimes( 1 );
		expect( mockTokenPurgeFn ).toHaveBeenCalledTimes( 1 );
		expect( tokenCache.clearAll ).toHaveBeenCalledTimes( 1 );
		expect( trackEvent ).toHaveBeenCalledWith( 'logout_command_execute' );
	} );

	it( 'handles logout API failure gracefully', async () => {
		mockHttpApiFn.mockRejectedValueOnce( new Error( 'Logout failed' ) );
		await expect( logout() ).rejects.toThrow();
		expect( mockTokenPurgeFn ).toHaveBeenCalledTimes( 1 );
		expect( tokenCache.clearAll ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'skips the server-side logout when the stored token cannot be read', async () => {
		mockTokenGetFn.mockRejectedValueOnce( new Error( 'An unknown error occurred.' ) );
		await logout();
		expect( mockHttpApiFn ).not.toHaveBeenCalled();
		expect( mockTokenPurgeFn ).toHaveBeenCalledTimes( 1 );
		expect( tokenCache.clearAll ).toHaveBeenCalledTimes( 1 );
		expect( trackEvent ).toHaveBeenCalledWith( 'logout_command_execute' );
	} );

	it( 'completes even when purging the stored token fails', async () => {
		mockHttpApiFn.mockResolvedValueOnce( { ok: true } as unknown as Response );
		mockTokenPurgeFn.mockRejectedValueOnce( new Error( 'An unknown error occurred.' ) );
		await logout();
		expect( tokenCache.clearAll ).toHaveBeenCalledTimes( 1 );
		expect( trackEvent ).toHaveBeenCalledWith( 'logout_command_execute' );
	} );
} );
