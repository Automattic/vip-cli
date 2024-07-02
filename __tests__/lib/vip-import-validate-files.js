import fs from 'fs';

import {
	folderStructureValidation,
	isFileSanitized,
	validateFiles,
} from '../../src/lib/vip-import-validate-files';

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
			expect( console.log.mock.calls[ 0 ][ 1 ] ).toEqual(
				expect.stringContaining( 'uploads/2020/06' )
			);
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

	describe( 'validateFiles()', () => {
		const mediaImportConfig = {
			allowedFileTypes: { jpg: 'image/jpeg', png: 'image/png' },
			fileSizeLimitInBytes: 5000000, // 5MB
			fileNameCharCount: 255,
		};

		afterEach( () => {
			jest.clearAllMocks();
		} );

		it( 'should detect invalid file types', async () => {
			jest
				.spyOn( fs.promises, 'stat' )
				.mockResolvedValue( { isDirectory: () => false, size: 4000 } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 10 } );

			const result = await validateFiles( [ 'file1.txt', 'file2.exe' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [ 'file1.txt', 'file2.exe' ] );
		} );

		it( 'should detect valid file types and invalid file sizes', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 6000000 } );

			const result = await validateFiles( [ 'file1.jpg', 'file2.png' ], mediaImportConfig );
			expect( result.errorFileSizes ).toEqual( [ 'file1.jpg', 'file2.png' ] );
		} );

		it( 'should detect valid file types and valid file sizes', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );

			const result = await validateFiles( [ 'file1.jpg', 'file2.png' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [] );
			expect( result.errorFileSizes ).toEqual( [] );
		} );

		it( 'should detect files with invalid filenames', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );
			const result = await validateFiles(
				[ 'file%20name.jpg', 'file+name.png' ],
				mediaImportConfig
			);
			expect( result.errorFileNames ).toEqual( [ 'file%20name.jpg', 'file+name.png' ] );
		} );

		it( 'should detect files with filenames exceeding character count limit', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );

			const longFileName = 'a'.repeat( 256 ) + '.jpg';
			const result = await validateFiles( [ longFileName ], mediaImportConfig );
			expect( result.errorFileNamesCharCount ).toEqual( [ longFileName ] );
		} );

		it( 'should detect intermediate images', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );

			const result = await validateFiles( [ 'image-4000x6000.jpg' ], mediaImportConfig );
			expect( result.intermediateImagesTotal ).toBe( 1 );
		} );
	} );
} );
