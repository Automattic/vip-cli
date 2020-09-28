/**
 * Internal dependencies
 */
import { isSupportedApp } from 'lib/site-import/db-file-import';

describe( 'site import tests', () => {
	describe( 'db-file-import', () => {
		describe( 'isSupportedApp', () => {
			it( 'should return true for type: WordPress', () => {
				expect( isSupportedApp( { type: 'WordPress' } ) ).toEqual( true );
			} );

			it( 'should return false for type: node', () => {
				expect( isSupportedApp( { type: 'node' } ) ).toEqual( false );
			} );

			it( 'should return false for no type', () => {
				expect( isSupportedApp( {} ) ).toEqual( false );
			} );
		} );
	} );
} );
