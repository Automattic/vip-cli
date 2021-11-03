/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { validateName } from 'lib/envvar/api';

describe( 'validateName', () => {
	it( 'validates allowed names', () => {
		const allowedNames = [
			'M',
			'MY',
			'MY_',
			'MY_V',
			'MY_VAR',
			'MY__VAR',
			'M2',
			'MY_VAR2',
			'MY_2VAR',
			'MY_2',
			'MY2VAR',
		];

		allowedNames.forEach( name => {
			expect( validateName( name ) ).toBe( true );
		} );
	} );

	it( 'rejects disallowed names', () => {
		const disallowedNames = [
			'1',
			'1M',
			'111',
			'_MY',
			'__MY_VAR',
			'2MY_VAR',
			'my_var',
			'myvar',
			'MY_VAr',
			'myVar',
			'  MY_VAR  ',
			'\nMY_VAR\n',
		];

		disallowedNames.forEach( name => {
			expect( validateName( name ) ).toBe( false );
		} );
	} );
} );
