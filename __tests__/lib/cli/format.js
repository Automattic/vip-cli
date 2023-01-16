/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { requoteArgs } from 'lib/cli/format';

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
} );
