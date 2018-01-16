const Token = require( '../../lib/token' );

describe( 'token tests', () => {
	test( 'should correctly validate token', () => {
		// Expires in 2050
		const t = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjRhM2RmYjE5LTBhMWQtNDE3YS05ODM2LTdjZWIwZTBkM2Q4NSIsImlhdCI6MTUxNjEyMzU1NywiZXhwIjoxNTE2MTI3MTYxfQ.qW1NOl4ww1Rrb8mPMDREdEAEFVr-aqg1Nk4XFqW2YE8';
		const token = new Token( t );
		expect( token.valid() ).toEqual( true );
		expect( token.expired() ).toEqual( false );
	} );
	test( 'should error for invalid token', () => {
		const t = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjRhM2RmYjE5LTBhMWQtNDE3YS05ODM2LTdjZWIwZTBkM2Q4NSIsImlhdCI6MTUxNjEyMzU1NywiZXhwIjoxNTE2MTI3zM4fQ.atx1YhxB6SQoW99aL97tXNlyJlXWEPZ3Cf1zyfxizvs';
		let token;
		try {
			token = new Token( t );
		} catch ( e ) {
		}

		expect( token ).toEqual( undefined );
	} );
	test( 'should not validate expired token', () => {
		const t = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiaWF0IjoxNTE1NzExMDY5LCJleHAiOjE1MTU3OTc0Njl9.hZ-mAeoFAahak9WXqAVTOKEU7R_f1VsZfS5HqZOm-a4';
		const token = new Token( t );
		expect( token.valid() ).toEqual( false );
		expect( token.expired() ).toEqual( true );
	} );
} );
