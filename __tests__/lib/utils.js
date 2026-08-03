import { parseApiError, splitKeyValueString } from '../../src/lib/utils';

describe( 'splitKeyValueString', () => {
	it.each( [
		[ 'KEY=VALUE', [ 'KEY', 'VALUE' ] ],
		[ ' KEY = VALUE ', [ 'KEY', 'VALUE' ] ],
		[ 'KEY=VALUE=WITH=EQUALS', [ 'KEY', 'VALUE=WITH=EQUALS' ] ],
		[ 'KEY=', [ 'KEY', '' ] ],
		[ 'KEY', [ 'KEY', '' ] ],
		[ '=VALUE', [ '', 'VALUE' ] ],
		[ '', [ '', '' ] ],
	] )( 'splits "%s" into %o', ( input, expected ) => {
		expect( splitKeyValueString( input ) ).toEqual( expected );
	} );
} );

describe( 'parseApiError', () => {
	it( 'extracts the message from an HTTP response body (bodyText)', () => {
		const error = Object.assign( new Error( 'Response not successful: Received status code 413' ), {
			bodyText: '{"status":"error","message":"Request body is too large"}',
		} );

		expect( parseApiError( error ) ).toBe( 'Request body is too large' );
	} );

	it( 'extracts a GraphQL error message from a bodyText errors array', () => {
		const error = Object.assign( new Error( 'Response not successful: Received status code 400' ), {
			bodyText: JSON.stringify( {
				errors: [ { message: 'Cannot query field "npmToken" on type "BuildConfiguration".' } ],
			} ),
		} );

		expect( parseApiError( error ) ).toBe(
			'Cannot query field "npmToken" on type "BuildConfiguration".'
		);
	} );

	it( 'extracts the first message from a bodyText errors array', () => {
		const error = Object.assign( new Error( 'Bad Request' ), {
			bodyText: JSON.stringify( {
				errors: [
					{ message: 'Field "provider" of required type was not provided.' },
					{ message: 'Field "providerXX" is not defined. Did you mean "provider"?' },
				],
			} ),
		} );

		expect( parseApiError( error ) ).toBe( 'Field "provider" of required type was not provided.' );
	} );

	it( 'extracts a networkError message', () => {
		const error = { networkError: { message: 'network is down' } };

		expect( parseApiError( error ) ).toBe( 'network is down' );
	} );

	it( 'extracts a graphQLErrors message', () => {
		const error = { graphQLErrors: [ { message: 'BAD_REQUEST message' } ] };

		expect( parseApiError( error ) ).toBe( 'BAD_REQUEST message' );
	} );

	it( 'falls back to the error message when bodyText is not JSON', () => {
		const error = Object.assign( new Error( 'Boom' ), { bodyText: 'not json' } );

		expect( parseApiError( error ) ).toBe( 'Boom' );
	} );

	it( 'falls back to the error message when the body has no message field', () => {
		const error = Object.assign( new Error( 'Boom' ), {
			bodyText: '{"status":"error"}',
		} );

		expect( parseApiError( error ) ).toBe( 'Boom' );
	} );

	it( 'returns the message for a plain Error', () => {
		expect( parseApiError( new Error( 'Something failed' ) ) ).toBe( 'Something failed' );
	} );

	it( 'returns null for unknown error shapes', () => {
		expect( parseApiError( { foo: 'bar' } ) ).toBeNull();
	} );
} );
