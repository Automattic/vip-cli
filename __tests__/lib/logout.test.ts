import { describe, expect, it, jest } from '@jest/globals';

import logout from '../../src/lib/logout';
import tokenCache from '../../src/lib/rechallenge/token-cache';
import Token from '../../src/lib/token';
import { trackEvent } from '../../src/lib/tracker';

jest.mock( '../../src/lib/api/http', () => ( {
	__esModule: true,
	default: jest.fn( () => Promise.resolve( { ok: true } ) ),
} ) );

jest.mock( '../../src/lib/token', () => ( {
	__esModule: true,
	default: {
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

describe( 'logout', () => {
	it( 'purges primary token, clears elevated-token cache, and emits telemetry', async () => {
		await logout();
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect( Token.purge ).toHaveBeenCalledTimes( 1 );
		expect( tokenCache.clearAll ).toHaveBeenCalledTimes( 1 );
		expect( trackEvent ).toHaveBeenCalledWith( 'logout_command_execute' );
	} );
} );
