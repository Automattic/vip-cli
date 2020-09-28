/**
 * Internal dependencies
 */
import { isSupportedApp, SUPPORTED_DB_FILE_IMPORT_SITE_TYPES } from 'lib/site-import/db-file-import';

describe( 'site import tests', () => {
	describe( 'db-file-import', () => {
		describe( 'constants', () => {
			it( 'should contain the correct list of supported app types', () => {
				expect( SUPPORTED_DB_FILE_IMPORT_SITE_TYPES ).toEqual( [ 'WordPress' ] );
			} );
		} );

		describe( 'isSupportedApp', () => {
			it( 'should return true for type: WordPress', () => {
				expect( isSupportedApp( { type: 'WordPress' } ) ).toBe( true );
			} );

			it( 'should return false for type: node', () => {
				expect( isSupportedApp( { type: 'node' } ) ).toBe( false );
			} );

			it( 'should return false for no type', () => {
				expect( isSupportedApp( {} ) ).toBe( false );
			} );
		} );
	} );
} );
