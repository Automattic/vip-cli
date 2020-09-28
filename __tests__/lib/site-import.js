/**
 * Internal dependencies
 */
import { isImportingBlockedBySync, isSupportedApp, SUPPORTED_DB_FILE_IMPORT_SITE_TYPES } from 'lib/site-import/db-file-import';

describe( 'site import tests', () => {
	describe( 'db-file-import', () => {
		describe( 'constants', () => {
			it( 'should contain the correct list of supported app types', () => {
				expect( SUPPORTED_DB_FILE_IMPORT_SITE_TYPES ).toEqual( [ 'WordPress' ] );
			} );
		} );

		describe( 'isImportingBlockedBySync', () => {
			it( 'should return false for not_syncing status', () => {
				expect( isImportingBlockedBySync( { syncProgress: { status: 'not_syncing' } } ) ).toBe( false );
			} );

			it( 'should return true for some other status', () => {
				expect( isImportingBlockedBySync( { syncProgress: { status: 'gibberish' } } ) ).toBe( true );
			} );

			it( 'should return true for missing status', () => {
				expect( isImportingBlockedBySync( { syncProgress: {} } ) ).toBe( true );
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
