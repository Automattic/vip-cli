import { splitKeyValueString } from '../../src/lib/utils';

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
