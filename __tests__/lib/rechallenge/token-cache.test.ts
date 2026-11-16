/* Jest mocks are method spies; inspecting them does not invoke detached methods. */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { createHash } from 'node:crypto';

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

jest.mock( '../../../src/lib/api/constants', () => ( {
	API_HOST: 'https://api.test.example:8443',
	PRODUCTION_API_HOST: 'https://api.wpvip.com',
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
	afterEach( async () => {
		const kc = ( await keychain.getKeychain() ) as Keychain & { __store: Map< string, string > };
		kc.__store.delete( 'vip-go-cli' );
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

	it( 'reloads persisted scopes and preserves deletion and expiry across memory resets', async () => {
		const kc = ( await keychain.getKeychain() ) as Keychain & { __store: Map< string, string > };
		const service = 'vip-go-cli:elevated:https---api-test-example-8443';
		kc.__store.set( 'vip-go-cli', 'primary-token' );
		const tokenA = makeToken( { token: 'A' } );
		const tokenB = makeToken( { token: 'B' } );
		const primaryTokenFingerprint = createHash( 'sha256' ).update( VALID_PAT_A ).digest( 'hex' );
		const cached = ( token: ElevatedToken ) => ( { ...token, primaryTokenFingerprint } );
		const expired = makeToken( {
			token: 'expired',
			expiresAt: new Date( Date.now() - 1_000 ).toISOString(),
		} );
		await tokenCache.set( 'alpha', tokenA );
		await tokenCache.set( 'beta', tokenB );
		await tokenCache.set( 'expired', expired );
		expect( kc.__store.get( service ) ).toBe(
			JSON.stringify( {
				alpha: cached( tokenA ),
				beta: cached( tokenB ),
				expired: cached( expired ),
			} )
		);
		expect( kc.__store.get( 'vip-go-cli' ) ).toBe( 'primary-token' );

		tokenCache._resetInMemoryForTests();
		expect( await tokenCache.get( 'alpha' ) ).toEqual( tokenA );
		expect( await tokenCache.get( 'beta' ) ).toEqual( tokenB );
		expect( await tokenCache.get( 'expired' ) ).toBeNull();
		expect( kc.__store.get( service ) ).toBe(
			JSON.stringify( { alpha: cached( tokenA ), beta: cached( tokenB ) } )
		);

		tokenCache._resetInMemoryForTests();
		expect( await tokenCache.get( 'expired' ) ).toBeNull();
		await tokenCache.clearScope( 'alpha' );
		expect( kc.__store.get( service ) ).toBe( JSON.stringify( { beta: cached( tokenB ) } ) );
		tokenCache._resetInMemoryForTests();
		expect( await tokenCache.get( 'alpha' ) ).toBeNull();
		expect( await tokenCache.get( 'beta' ) ).toEqual( tokenB );

		await tokenCache.clearAll();
		expect( [ ...kc.__store.entries() ] ).toEqual( [ [ 'vip-go-cli', 'primary-token' ] ] );
		tokenCache._resetInMemoryForTests();
		expect( await tokenCache.get( 'beta' ) ).toBeNull();
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
