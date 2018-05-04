/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import app from 'lib/api/app';

describe( 'api tests', () => {
	test( 'should correctly get app by id', async () => {
		const res = await app( 297, 'id,name' );
		expect( res ).resolves;
		expect( res.id ).toBe( 297 );
		expect( res.name ).toBe( 'vip-test' );
	} );

	test( 'should correctly get app by name', async () => {
		const res = await app( 'vip-test', 'id,name' );
		expect( res ).resolves;
		expect( res.id ).toBe( 297 );
		expect( res.name ).toBe( 'vip-test' );
	} );

	test( 'should throw on null app', async () => {
		expect.assertions( 1 );

		try {
			await app( null, 'id,name' );
		} catch ( e ) {
			expect( e ).toEqual( expect.anything() );
		}
	} );

	test( 'should throw on empty string', async () => {
		expect.assertions( 1 );

		try {
			await app( '', 'id,name' );
		} catch ( e ) {
			expect( e ).toEqual( expect.anything() );
		}
	} );
} );
