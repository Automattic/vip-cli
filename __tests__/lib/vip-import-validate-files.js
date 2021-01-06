/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import {
	folderStructureValidation,
	isFileSanitized,
} from 'lib/vip-import-validate-files';

global.console = { log: jest.fn() };

describe( 'lib/vip-import-validate-files', () => {
	describe( 'folderStructureValidation', () => {
		it( 'should correctly validate a recommended folder structure', async () => {
			const folderStructureObj = {
				'uploads/2020/06': true,
				'uploads/2019/01': true,
				'uploads/2018/03': true,
			};

			// Mock console.log()
			jest.spyOn( global.console, 'log' );

			// Call function
			folderStructureValidation( Object.keys( folderStructureObj ) );

			expect( console.log ).toHaveBeenCalled();
			expect( console.log.mock.calls[ 0 ][ 0 ] ).toEqual( expect.stringContaining( 'Folder:' ) );
			expect( console.log.mock.calls[ 0 ][ 1 ] ).toEqual( expect.stringContaining( 'uploads/2020/06' ) );
		} );
		it( 'should log recommendations for a non-recommended folder structure', async () => {
			const path = 'folder/structure/not-recommended';

			jest.spyOn( global.console, 'log' );

			folderStructureValidation( path );

			expect( console.log ).toHaveBeenCalled();
		} );
	} );

	describe( 'isFileSanitized()', () => {
		it( 'should correctly check to see if a file is sanitized', async () => {
			const image = 'not-allowed-filename++.jpg';

			const isSanitized = isFileSanitized( image );

			expect( isSanitized ).toBe( true );
		} );
	} );
} );
