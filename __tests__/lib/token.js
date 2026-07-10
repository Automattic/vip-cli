import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

import * as keychain from '../../src/lib/keychain';
import Token, { SERVICE, ENV_TOKEN_NAME, EnvTokenError } from '../../src/lib/token';

// A valid, non-expiring token (id: 7).
const VALID_RAW_TOKEN =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';

describe( 'token tests', () => {
	it( 'should correctly validate token', () => {
		// Does not expire
		const rawToken =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';
		const token = new Token( rawToken );
		expect( token.valid() ).toEqual( true );
		expect( token.expired() ).toEqual( false );
	} );

	it( 'should correctly validate token missing an id', () => {
		const rawToken =
			'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxMzUyNzYsImV4cCI6MjUyNDYwODAwMCwiYXVkIjoiIiwic3ViIjoiIn0.seD8rBKJS0usjYApigqizitlNcmzcrYlGt9DyCm3I4c';
		const token = new Token( rawToken );
		expect( token.valid() ).toEqual( false );
	} );

	it( 'should error for invalid token', () => {
		const rawToken =
			'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjRhM2RmYjE5LTBhMWQtNDE3YS05ODM2LTdjZWIwZTBkM2Q4NSIsImlhdCI6MTUxNjEyMzU1NywiZXhwIjoxNTE2MTI3zM4fQ.atx1YhxB6SQoW99aL97tXNlyJlXWEPZ3Cf1zyfxizvs';
		let token;
		expect( () => {
			token = new Token( rawToken );
		} ).toThrow();
		expect( token ).toBeUndefined();
	} );

	it( 'should not validate expired token', () => {
		const rawToken =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiaWF0IjoxNTE1NzExMDY5LCJleHAiOjE1MTU3OTc0Njl9.hZ-mAeoFAahak9WXqAVTOKEU7R_f1VsZfS5HqZOm-a4';
		const token = new Token( rawToken );
		expect( token.valid() ).toEqual( false );
		expect( token.expired() ).toEqual( true );
	} );

	it( 'should correctly validate token with invalid whitespace', () => {
		const leadingWhitespace =
			' eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';
		let token = new Token( leadingWhitespace );
		expect( token.valid() ).toEqual( true );

		const trailingWhitespace =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA ';
		token = new Token( trailingWhitespace );
		expect( token.valid() ).toEqual( true );

		const justWhitespace = ' ';
		token = new Token( justWhitespace );
		expect( token.valid() ).toEqual( false );
	} );

	it( 'should consistently return uuid', () => {
		return Token.uuid().then( uuid1 => {
			return Token.uuid().then( uuid2 => {
				expect( uuid1 ).toBe( uuid2 );
			} );
		} );
	} );

	describe( 'get() with VIP_CLI_TOKEN', () => {
		const originalEnvToken = process.env[ ENV_TOKEN_NAME ];
		let getKeychainSpy;

		beforeEach( () => {
			delete process.env[ ENV_TOKEN_NAME ];

			// token.ts is loaded during the jest setup files (via apiConfig), so
			// it has already bound the real keychain module. Spying on the shared
			// module object still intercepts its calls because token.ts reads
			// getKeychain at call time. A plain jest.mock() would not, since it
			// only rebinds future imports.
			getKeychainSpy = jest.spyOn( keychain, 'getKeychain' ).mockResolvedValue( {
				getPassword: jest.fn( () => Promise.resolve( null ) ),
				setPassword: jest.fn( () => Promise.resolve( true ) ),
				deletePassword: jest.fn( () => Promise.resolve( true ) ),
			} );
		} );

		afterEach( () => {
			getKeychainSpy.mockRestore();

			if ( originalEnvToken === undefined ) {
				delete process.env[ ENV_TOKEN_NAME ];
			} else {
				process.env[ ENV_TOKEN_NAME ] = originalEnvToken;
			}
		} );

		it( 'returns a token built from the env var without touching the keychain', async () => {
			process.env[ ENV_TOKEN_NAME ] = VALID_RAW_TOKEN;

			const token = await Token.get();

			expect( token.raw ).toBe( VALID_RAW_TOKEN );
			expect( token.valid() ).toBe( true );
			expect( getKeychainSpy ).not.toHaveBeenCalled();
		} );

		it( 'trims surrounding whitespace on the env var token', async () => {
			process.env[ ENV_TOKEN_NAME ] = `  ${ VALID_RAW_TOKEN }  `;

			const token = await Token.get();

			expect( token.raw ).toBe( VALID_RAW_TOKEN );
			expect( getKeychainSpy ).not.toHaveBeenCalled();
		} );

		it( 'throws an EnvTokenError naming the variable for a malformed env token', async () => {
			process.env[ ENV_TOKEN_NAME ] = 'not-a-jwt';

			await expect( Token.get() ).rejects.toThrow( EnvTokenError );
			await expect( Token.get() ).rejects.toThrow( ENV_TOKEN_NAME );
			expect( getKeychainSpy ).not.toHaveBeenCalled();
		} );

		it( 'falls back to the keychain when the env var is unset', async () => {
			await Token.get();

			expect( getKeychainSpy ).toHaveBeenCalled();
		} );

		it( 'falls back to the keychain when the env var is empty', async () => {
			process.env[ ENV_TOKEN_NAME ] = '';

			await Token.get();

			expect( getKeychainSpy ).toHaveBeenCalled();
		} );

		it( 'falls back to the keychain when the env var is only whitespace', async () => {
			process.env[ ENV_TOKEN_NAME ] = '   ';

			await Token.get();

			expect( getKeychainSpy ).toHaveBeenCalled();
		} );

		it( 'reports whether the env var is set via isEnvTokenSet()', () => {
			expect( Token.isEnvTokenSet() ).toBe( false );

			process.env[ ENV_TOKEN_NAME ] = '   ';
			expect( Token.isEnvTokenSet() ).toBe( false );

			process.env[ ENV_TOKEN_NAME ] = VALID_RAW_TOKEN;
			expect( Token.isEnvTokenSet() ).toBe( true );
		} );
	} );

	describe( 'getServiceName()', () => {
		// TODO how do we test this when it comes from env var, which we've already overridden?
		it.todo( 'should return default service name for default API_HOST' );

		it( 'should add the API_HOST to the service name if overridden', () => {
			const name = Token.getServiceName();

			const sanitizedHost = 'http---localhost-4000'; // Sanitized version of process.env.API_HOST

			expect( name ).toBe( `${ SERVICE }:${ sanitizedHost }` );
		} );

		it( 'should append an optional modifier to the final service name', () => {
			const modifier = '-foo';

			const name = Token.getServiceName( modifier );

			const sanitizedHost = 'http---localhost-4000'; // Sanitized version of process.env.API_HOST

			expect( name ).toBe( `${ SERVICE }:${ sanitizedHost }${ modifier }` );
		} );
	} );
} );
