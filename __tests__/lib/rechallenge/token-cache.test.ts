/* Jest mocks are method spies; inspecting them does not invoke detached methods. */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import * as keychain from '../../../src/lib/keychain';
import tokenCache from '../../../src/lib/rechallenge/token-cache';
import Token from '../../../src/lib/token';

import type { Keychain } from '../../../src/lib/keychain/keychain';
import type { ElevatedToken } from '../../../src/lib/rechallenge/types';

jest.mock( '../../../src/lib/token', () => ( {
	__esModule: true,
	default: {
		resolve: jest.fn(),
		isEnvironmentSet: jest.fn( () => false ),
	},
} ) );

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

const VALID_PAT_A = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6NywiaWF0IjoxNTE2MjM5MDIyfQ.signature';
const VALID_PAT_B = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6OCwiaWF0IjoxNTE2MjM5MDIyfQ.signature';

describe( 'rechallenge token cache', () => {
	beforeEach( async () => {
		delete process.env.VIP_CLI_TOKEN;
		await tokenCache.clearAll();
		tokenCache._resetInMemoryForTests();
		jest.clearAllMocks();
		jest.mocked( Token.resolve ).mockResolvedValue( {
			token: { raw: VALID_PAT_A } as Token,
			source: 'stored',
		} );
		jest.mocked( Token.isEnvironmentSet ).mockReturnValue( false );
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
		const tokenA = makeToken( { token: 'A' } );
		const tokenB = makeToken( { token: 'B' } );
		await tokenCache.set( 'updateDefensiveModeStatus', tokenA );
		await tokenCache.set( 'updateDefensiveModeConfig', tokenB );
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

		expect( kc.deletePassword ).toHaveBeenCalled();
	} );

	it( 'does not reuse a stored step-up token after the primary PAT changes', async () => {
		await tokenCache.set( 'updateDefensiveModeStatus', makeToken( { token: 'for-A' } ) );
		jest.mocked( Token.resolve ).mockResolvedValue( {
			token: { raw: VALID_PAT_B } as Token,
			source: 'stored',
		} );
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();
	} );

	it( 'does not use an unbound legacy cache entry', async () => {
		const kc = ( await keychain.getKeychain() ) as Keychain & jest.Mocked< Keychain >;
		kc.getPassword.mockResolvedValueOnce(
			JSON.stringify( {
				updateDefensiveModeStatus: makeToken( { token: 'legacy' } ),
			} )
		);
		tokenCache._resetInMemoryForTests();
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();
	} );

	it( 'keeps environment step-up tokens in memory and isolates changes of PAT', async () => {
		jest.mocked( Token.resolve ).mockResolvedValue( {
			token: { raw: VALID_PAT_A } as Token,
			source: 'environment',
		} );
		jest.mocked( Token.isEnvironmentSet ).mockReturnValue( true );
		await tokenCache.set( 'updateDefensiveModeStatus', makeToken( { token: 'for-env-A' } ) );
		expect( ( await tokenCache.get( 'updateDefensiveModeStatus' ) )?.token ).toBe( 'for-env-A' );
		// No read or write of the primary or elevated keychain entry.
		expect( keychain.getKeychain ).not.toHaveBeenCalled();
		jest.mocked( Token.resolve ).mockResolvedValue( {
			token: { raw: VALID_PAT_B } as Token,
			source: 'environment',
		} );
		expect( await tokenCache.get( 'updateDefensiveModeStatus' ) ).toBeNull();
		expect( keychain.getKeychain ).not.toHaveBeenCalled();
	} );
} );
