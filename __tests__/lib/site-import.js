/**
 * Internal dependencies
 */
import { isImportingBlockedBySync, isSupportedApp } from '../../src/lib/site-import/db-file-import';

describe( 'site import tests', () => {
	describe( 'db-file-import', () => {
		describe( 'isImportingBlockedBySync', () => {
			it( 'should return false for not_syncing status', () => {
				expect( isImportingBlockedBySync( { syncProgress: { status: 'not_syncing' } } ) ).toBe(
					false
				);
			} );

			it( 'should return true for some other status', () => {
				expect( isImportingBlockedBySync( { syncProgress: { status: 'gibberish' } } ) ).toBe(
					true
				);
			} );

			it( 'should return true for missing status', () => {
				expect( isImportingBlockedBySync( { syncProgress: {} } ) ).toBe( true );
			} );
		} );

		describe( 'isSupportedApp', () => {
			it( 'should return true for site types with a database', () => {
				expect( isSupportedApp( { typeId: 2 } ) ).toBe( true );
				expect( isSupportedApp( { typeId: 5 } ) ).toBe( true );
				expect( isSupportedApp( { typeId: 6 } ) ).toBe( true );
				expect( isSupportedApp( { typeId: 8 } ) ).toBe( true );
			} );

			it( 'should return false for site types without a database', () => {
				expect( isSupportedApp( { typeId: 3 } ) ).toBe( false );
				expect( isSupportedApp( { typeId: 4 } ) ).toBe( false );
				expect( isSupportedApp( { typeId: 7 } ) ).toBe( false );
				expect( isSupportedApp( { typeId: 3 } ) ).toBe( false );
			} );

			it( 'should return false for no type', () => {
				expect( isSupportedApp( {} ) ).toBe( false );
			} );
		} );
	} );
} );
