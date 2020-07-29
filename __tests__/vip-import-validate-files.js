/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import {
	folderStructureValidation,
} from 'lib/vip-import-validate-files';

 describe( 'lib/vip-import-validate-files', () => {   
     it ( 'should correctly validate a recommended folder structure', async () => {
        const path = 'uploads/2020/06';

        console.log = jest.fn();

        const folderStructure = folderStructureValidation( path );

        expect( console.log ).toHaveBeenCalledWith( '✅ File structure: Uploads directory exists' );
    } );
    it ( 'should log recommendations for a non-recommended folder structure', async () => {
        const path = 'folder/structure/not-recommended';

        console.log = jest.fn();

        const folderStructure = folderStructureValidation( path );

        expect( console.log ).toHaveBeenCalled();
    } );
 } );
