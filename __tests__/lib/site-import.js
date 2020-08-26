/**
 * Internal dependencies
 */
import siteImport from 'lib/site-import';
import dbFileImport from 'lib/site-import/db-file-import';

describe( 'site import tests', () => {
	describe( 'siteImport', () => {
		it( 'should have an object called dbSiteImport', () => {
			expect( typeof siteImport.dbFileImport ).toEqual( 'object' );
		} );
	} );
	describe( 'dbFileImport', () => {
		describe( 'importFile', () => {
			it( 'should exist', () => {
				const { importFile } = dbFileImport;
				expect( typeof importFile ).toEqual( 'function' );
			} );
		} );
	} );
} );
