import Token, { SERVICE } from '../../src/lib/token';

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

// Credential source selection must never touch a stored credential when an
// environment PAT was explicitly supplied.
describe( 'environment PAT resolution', () => {
	const original = process.env.VIP_CLI_TOKEN;
	const valid =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';
	let keychainSpy;

	beforeEach( () => {
		delete process.env.VIP_CLI_TOKEN;
		keychainSpy = jest
			.spyOn( require( '../../src/lib/keychain' ), 'getKeychain' )
			.mockResolvedValue( {
				getPassword: jest.fn().mockResolvedValue( valid ),
				setPassword: jest.fn().mockResolvedValue( true ),
				deletePassword: jest.fn().mockResolvedValue( true ),
			} );
	} );

	afterEach( () => {
		keychainSpy.mockRestore();
		if ( original === undefined ) {
			delete process.env.VIP_CLI_TOKEN;
		} else {
			process.env.VIP_CLI_TOKEN = original;
		}
	} );

	it( 'uses the trimmed environment PAT without reading the keychain', async () => {
		process.env.VIP_CLI_TOKEN = `  ${ valid }  `;
		const resolved = await Token.resolve();
		expect( resolved.source ).toBe( 'environment' );
		expect( resolved.token.raw ).toBe( valid );
		expect( keychainSpy ).not.toHaveBeenCalled();
	} );

	it( 'uses a process-local analytics ID without keychain access for an environment PAT', async () => {
		process.env.VIP_CLI_TOKEN = valid;
		const first = await Token.uuid();
		const second = await Token.uuid();
		expect( first ).toBeTruthy();
		expect( second ).toBe( first );
		expect( keychainSpy ).not.toHaveBeenCalled();
	} );

	it( 'uses the stored PAT when the environment value is blank', async () => {
		process.env.VIP_CLI_TOKEN = '   ';
		const resolved = await Token.resolve();
		expect( resolved.source ).toBe( 'stored' );
		expect( resolved.token.raw ).toBe( valid );
		expect( keychainSpy ).toHaveBeenCalledTimes( 1 );
	} );

	it.each( [
		[ 'malformed', 'not-a-jwt' ],
		[
			'expired',
			'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MiwiaWF0IjoxNTE1NzExMDY5LCJleHAiOjE1MTU3OTc0Njl9.signature',
		],
		[ 'missing id', 'eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE1MTYyMzkwMjJ9.signature' ],
	] )( 'rejects a %s environment PAT without falling back', async ( _label, raw ) => {
		process.env.VIP_CLI_TOKEN = raw;
		await expect( Token.resolve() ).rejects.toThrow( /VIP_CLI_TOKEN/ );
		expect( keychainSpy ).not.toHaveBeenCalled();
	} );
} );
