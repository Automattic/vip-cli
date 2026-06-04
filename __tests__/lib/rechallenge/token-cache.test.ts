import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import * as keychain from '../../../src/lib/keychain';
import tokenCache from '../../../src/lib/rechallenge/token-cache';

import type { Keychain } from '../../../src/lib/keychain/keychain';
import type { ElevatedToken } from '../../../src/lib/rechallenge/types';

jest.mock( '../../../src/lib/keychain', () => {
	const store = new Map< string, string >();
	const mockedKeychain = {
		getPassword: jest.fn( ( service: string ) => Promise.resolve( store.get( service ) ?? null ) ),
		setPassword: jest.fn( ( service: string, password: string ) => {
			store.set( service, password );
			return Promise.resolve( true );
		} ),
		deletePassword: jest.fn( ( service: string ) => {
			const had = store.delete( service );
			return Promise.resolve( had );
		} ),
		__store: store,
	};

	return {
		__esModule: true,
		getKeychain: jest.fn( () => Promise.resolve( mockedKeychain ) ),
	};
} );

function makeToken( overrides: Partial< ElevatedToken > = {} ): ElevatedToken {
	return {
		token: 'jwt.payload.sig',
		expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
		purpose: 'validate-elevated-permissions',
		...overrides,
	};
}

describe( 'rechallenge token cache', () => {
	beforeEach( async () => {
		await tokenCache.clearAll();
		tokenCache._resetInMemoryForTests();
		jest.clearAllMocks();
	} );

	it( 'returns null when no token has been stored for a scope', async () => {
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();
	} );

	it( 'stores and retrieves a token by scope', async () => {
		const token = makeToken();
		await tokenCache.set( 'updateDefensiveModeStatus', token );
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toEqual( token );
	} );

	it( 'keeps tokens isolated by scope', async () => {
		const a = makeToken( { token: 'A' } );
		const b = makeToken( { token: 'B' } );
		await tokenCache.set( 'updateDefensiveModeStatus', a );
		await tokenCache.set( 'updateDefensiveModeConfig', b );
		expect( ( await tokenCache.get( 'updateDefensiveModeStatus' ) )?.token ).toBe( 'A' );
		expect( ( await tokenCache.get( 'updateDefensiveModeConfig' ) )?.token ).toBe( 'B' );
	} );

	it( 'returns null and self-evicts when token is expired', async () => {
		const expired = makeToken( {
			expiresAt: new Date( Date.now() - 1_000 ).toISOString(),
		} );
		await tokenCache.set( 'updateDefensiveModeStatus', expired );
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();
		// Eviction writes through to keychain so the expired entry can't reappear.

		const kc = await keychain.getKeychain();
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect( kc.deletePassword ).toHaveBeenCalled();
	} );

	it( 'clearAll removes every scope', async () => {
		await tokenCache.set( 'a', makeToken() );
		await tokenCache.set( 'b', makeToken() );
		await tokenCache.clearAll();
		expect( await tokenCache.get( 'a' ) ).toBeNull();
		expect( await tokenCache.get( 'b' ) ).toBeNull();
	} );

	it( 'clearScope removes only the requested scope', async () => {
		await tokenCache.set( 'a', makeToken( { token: 'A' } ) );
		await tokenCache.set( 'b', makeToken( { token: 'B' } ) );
		await tokenCache.clearScope( 'a' );
		expect( await tokenCache.get( 'a' ) ).toBeNull();
		expect( ( await tokenCache.get( 'b' ) )?.token ).toBe( 'B' );
	} );

	it( 'resets and purges keychain when stored blob is malformed JSON', async () => {
		// Force a corrupt blob to land in the mock store. We need the
		// keychain mock to return invalid JSON on the next read.
		const kc = ( await keychain.getKeychain() ) as Keychain & jest.Mocked< Keychain >;
		kc.getPassword.mockResolvedValueOnce( 'not-valid-json{' );
		tokenCache._resetInMemoryForTests();

		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();

		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect( kc.deletePassword ).toHaveBeenCalled();
	} );
} );
