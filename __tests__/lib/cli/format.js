import { formatBytes, formatDuration, requoteArgs, table } from '../../../src/lib/cli/format';

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
				expected: [ '"{\\"json\\":broken json with spaces}"' ],
			},
			{
				input: [ '--foo=bar1 "bar2" "bar3"' ],
				expected: [ '--foo="bar1 \\"bar2\\" \\"bar3\\""' ],
			},
			{
				input: [ '--foo', 'bar1 "bar2" "bar3"' ],
				expected: [ '--foo', '"bar1 \\"bar2\\" \\"bar3\\""' ],
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

	describe( 'table', () => {
		it( 'should properly format null values', () => {
			expect( table( [ { name: 'Hello', value: null } ] ) ).toMatch( /.*Hello.*null.*/i );
		} );
	} );

	describe( 'formatDuration', () => {
		it( 'should format duration', () => {
			expect(
				formatDuration(
					new Date( '2020-01-01T00:00:00.000Z' ),
					new Date( '2020-01-01T00:20:01.000Z' )
				)
			).toStrictEqual( '20 minutes 1 second' );

			expect(
				formatDuration(
					new Date( '2020-01-01T00:00:00.000Z' ),
					new Date( '2020-04-01T07:04:02.000Z' )
				)
			).toStrictEqual( '91 days 7 hours 4 minutes 2 seconds' );
		} );

		it( 'should address appropriately if from > to', () => {
			expect(
				formatDuration(
					new Date( '2020-02-01T00:00:00.000Z' ),
					new Date( '2019-12-31T23:59:59.000Z' )
				)
			).toStrictEqual( '0 second' );
		} );
	} );
} );
