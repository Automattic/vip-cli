/**
 * Internal dependencies
 */
import Token, { SERVICE } from 'lib/token';

describe( 'token tests', () => {
	it( 'should correctly validate token', () => {
		// Does not expire
		const t = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';
		const token = new Token( t );
		expect( token.valid() ).toEqual( true );
		expect( token.expired() ).toEqual( false );
	} );

	it( 'should correctly validate token missing an id', () => {
		// eslint-disable-next-line max-len
		const t = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxMzUyNzYsImV4cCI6MjUyNDYwODAwMCwiYXVkIjoiIiwic3ViIjoiIn0.seD8rBKJS0usjYApigqizitlNcmzcrYlGt9DyCm3I4c';
		const token = new Token( t );
		expect( token.valid() ).toEqual( false );
	} );

	it( 'should error for invalid token', () => {
		// eslint-disable-next-line max-len
		const t = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjRhM2RmYjE5LTBhMWQtNDE3YS05ODM2LTdjZWIwZTBkM2Q4NSIsImlhdCI6MTUxNjEyMzU1NywiZXhwIjoxNTE2MTI3zM4fQ.atx1YhxB6SQoW99aL97tXNlyJlXWEPZ3Cf1zyfxizvs';
		let token;
		try {
			token = new Token( t );
		} catch ( e ) {
		}

		expect( token ).toBeUndefined();
	} );

	it( 'should not validate expired token', () => {
		const t = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiaWF0IjoxNTE1NzExMDY5LCJleHAiOjE1MTU3OTc0Njl9.hZ-mAeoFAahak9WXqAVTOKEU7R_f1VsZfS5HqZOm-a4';
		const token = new Token( t );
		expect( token.valid() ).toEqual( false );
		expect( token.expired() ).toEqual( true );
	} );

	it( 'should correctly validate token with invalid whitespace', () => {
		const leadingWhitespace = ' eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA';
		let token = new Token( leadingWhitespace );
		expect( token.valid() ).toEqual( true );

		const trailingWhitespace = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA ';
		token = new Token( trailingWhitespace );
		expect( token.valid() ).toEqual( true );

		const justWhitespace = ' ';
		token = new Token( justWhitespace );
		expect( token.valid() ).toEqual( false );
	} );

	it( 'should consistently return uuid', () => {
		Token.uuid().then( uuid1 => {
			Token.uuid().then( uuid2 => {
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
