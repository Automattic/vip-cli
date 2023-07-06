/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { formatBytes, requoteArgs } from '../../../src/lib/cli/format';

describe( 'utils/cli/format', () => {
	describe( 'requoteArgs', () => {
		it.each( [
			{
				input: [ 'text with spaces' ],
				expected: [ '"text with spaces"' ],
			},
			{
				input: [ 'textnospaces' ],
				expected: [ 'textnospaces' ],
			},
			{
				input: [ '{"json":"json with spaces"}' ],
				expected: [ '{"json":"json with spaces"}' ],
			},
			{
				input: [ '{ "json"     :    "json with spaces outside strings"     }' ],
				expected: [ '{ "json"     :    "json with spaces outside strings"     }' ],
			},
			{
				input: [
					'   { "json"     :    "json with spaces outside strings and outside the object"     }   ',
				],
				expected: [
					'   { "json"     :    "json with spaces outside strings and outside the object"     }   ',
				],
			},
			{
				input: [ '{ "json" : "spaces-outside-strings-only"      }' ],
				expected: [ '{ "json" : "spaces-outside-strings-only"      }' ],
			},
			{
				input: [ '{"json":broken json with spaces}' ],
				expected: [ '"{"json":broken json with spaces}"' ],
			},
		] )( 'should requote args when needed - %o', ( { input, expected } ) => {
			const result = requoteArgs( input );
			expect( result ).toStrictEqual( expected );
		} );
	} );

	describe( 'formatBytes', () => {
		it( 'should format bytes', () => {
			expect( formatBytes( 1000 ) ).toStrictEqual( '1000 bytes' );
			expect( formatBytes( 1024 ) ).toStrictEqual( '1 KB' );
			expect( formatBytes( 1000000 ) ).toStrictEqual( '976.56 KB' );
			expect( formatBytes( 10004008 ) ).toStrictEqual( '9.54 MB' );
		} );
	} );
} );
