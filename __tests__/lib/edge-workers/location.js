import { parseLocationOption } from '../../../src/lib/edge-workers/location';

describe( 'parseLocationOption()', () => {
	it.each( [
		[ 'starts_with:/api/', { operator: 'starts_with', value: '/api/' } ],
		[ 'equals:/feed', { operator: 'equals', value: '/feed' } ],
		[ 'ends_with:.json', { operator: 'ends_with', value: '.json' } ],
		[ 'contains:preview', { operator: 'contains', value: 'preview' } ],
		// Only the first colon separates the operator; the value keeps the rest.
		[ 'equals:/api/v1:beta', { operator: 'equals', value: '/api/v1:beta' } ],
	] )( 'parses %s', ( raw, expected ) => {
		expect( parseLocationOption( raw ) ).toEqual( expected );
	} );

	it.each( [ 'starts_with', 'starts_with:', 'matches:/api/', ':/api/', '/api/', '' ] )(
		'rejects %s',
		raw => {
			expect( () => parseLocationOption( raw ) ).toThrow( 'Invalid location' );
		}
	);
} );
