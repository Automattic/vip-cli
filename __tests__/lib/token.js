const token = require( '../../lib/token' );

describe( 'token tests', () => {
	test( 'should correctly validate token' );
	test( 'should error for invalid token' );
	test( 'should not validate expired token' );
} );
