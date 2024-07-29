import chalk from 'chalk';
import cp from 'child_process';
import fs from 'fs';

import {
	folderStructureValidation,
	isFileSanitized,
	validateFiles,
	logErrors,
	findNestedDirectories,
} from '../../src/lib/vip-import-validate-files';

global.console = { log: jest.fn(), error: jest.fn() };

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
			allowedFileTypes: {
				jpg: 'image/jpeg',
				png: 'image/png',
				mp3: 'audio/mpeg',
			},
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
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'text/plain' );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'application/octet-stream' );

			const result = await validateFiles( [ 'file1.txt', 'file2.exe' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [ 'file1.txt', 'file2.exe' ] );
		} );

		it( 'should detect valid file types and invalid file sizes', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 6000000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/jpeg' );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/png' );

			const result = await validateFiles( [ 'file1.jpg', 'file2.png' ], mediaImportConfig );
			expect( result.errorFileSizes ).toEqual( [ 'file1.jpg', 'file2.png' ] );
		} );

		it( 'should detect valid file types and valid file sizes', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/jpeg' );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/png' );

			const result = await validateFiles( [ 'file1.jpg', 'file2.png' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [] );
			expect( result.errorFileSizes ).toEqual( [] );
		} );

		it( 'should detect files with invalid filenames', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/jpeg' );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/png' );

			const result = await validateFiles(
				[ 'file%20name.jpg', 'file+name.png' ],
				mediaImportConfig
			);
			expect( result.errorFileNames ).toEqual( [ 'file%20name.jpg', 'file+name.png' ] );
		} );

		it( 'should detect files with filenames exceeding character count limit', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/jpeg' );

			const longFileName = 'a'.repeat( 256 ) + '.jpg';
			const result = await validateFiles( [ longFileName ], mediaImportConfig );
			expect( result.errorFileNamesCharCount ).toEqual( [ longFileName ] );
		} );

		it( 'should detect intermediate images', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 4000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'image/jpeg' );

			const result = await validateFiles( [ 'image-4000x6000.jpg' ], mediaImportConfig );
			expect( result.intermediateImagesTotal ).toBe( 1 );
		} );

		it( 'should check mime for generic file types', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 60000 } );

			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'application/octet-stream' );
			const result = await validateFiles( [ 'file1.txt' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [ 'file1.txt' ] );

			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'application/octet-stream' );
			const result2 = await validateFiles( [ 'file1.mp3' ], mediaImportConfig );
			expect( result2.errorFileTypes ).toEqual( [] );
		} );

		it( 'should check mime for audio/video', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 60000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'audio/mpeg' );

			const result = await validateFiles( [ 'file1.txt' ], mediaImportConfig );
			expect( result.errorFileTypes ).toEqual( [ 'file1.txt' ] );

			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'audio/mpeg' );
			const result2 = await validateFiles( [ 'file1.mp3' ], mediaImportConfig );
			expect( result2.errorFileTypes ).toEqual( [] );
		} );

		it( 'should check file extension for plain text', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 60000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'text/plain' );

			const config = {
				...mediaImportConfig,
				allowedFileTypes: {
					jpg: 'image/jpeg',
					png: 'image/png',
					mp3: 'audio/mpeg',
					csv: 'text/csv',
				},
			};
			const result = await validateFiles( [ 'file1.mp3' ], config );
			expect( result.errorFileTypes ).toEqual( [ 'file1.mp3' ] );

			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'text/plain' );
			const resul2 = await validateFiles( [ 'file1.csv' ], config );
			expect( resul2.errorFileTypes ).toEqual( [] );
		} );

		it( 'should check file extension for rich text', async () => {
			jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'statSync' ).mockReturnValue( { size: 60000 } );
			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'text/rtf' );

			const config = {
				...mediaImportConfig,
				allowedFileTypes: {
					jpg: 'image/jpeg',
					png: 'image/png',
					mp3: 'audio/mpeg',
					rtf: 'ext/rtf',
				},
			};
			const result = await validateFiles( [ 'file1.mp3' ], config );
			expect( result.errorFileTypes ).toEqual( [ 'file1.mp3' ] );

			jest.spyOn( cp, 'execFileSync' ).mockReturnValueOnce( 'text/rtf' );
			const resul2 = await validateFiles( [ 'file1.rtf' ], config );
			expect( resul2.errorFileTypes ).toEqual( [] );
		} );
	} );

	describe( 'logErrors()', () => {
		const mockConsoleError = jest.spyOn( console, 'error' ).mockImplementation();

		afterEach( () => {
			mockConsoleError.mockClear();
		} );

		it( 'should log correct messages for invalid_types', () => {
			const errorType = 'invalid_types';
			const invalidFiles = [ 'file1.txt', 'file2.jpg' ];
			const limit = '';

			logErrors( { errorType, invalidFiles, limit } );

			invalidFiles.forEach( file => {
				expect( mockConsoleError ).toHaveBeenCalledWith(
					chalk.red( '✕' ),
					'File extensions: Invalid file type for file: ',
					chalk.cyan( file )
				);
			} );
		} );

		it( 'should log correct messages for intermediate_images', () => {
			const errorType = 'intermediate_images';
			const invalidFiles = [ 'image1.jpg' ];
			const limit = { 'image1.jpg': 'intermediate1.jpg' };

			logErrors( { errorType, invalidFiles, limit } );

			invalidFiles.forEach( file => {
				expect( mockConsoleError ).toHaveBeenCalledWith(
					chalk.red( '✕' ),
					'Intermediate images: Duplicate files found:\n' +
						'Original file: ' +
						chalk.blue( `${ file }\n` ) +
						'Intermediate images: ' +
						chalk.cyan( `${ limit[ file ] }\n` )
				);
			} );
		} );

		it( 'should log correct messages for invalid_sizes', () => {
			const errorType = 'invalid_sizes';
			const invalidFiles = [ 'file3.pdf' ];
			const limit = 1024;

			logErrors( { errorType, invalidFiles, limit } );

			invalidFiles.forEach( file => {
				expect( mockConsoleError ).toHaveBeenCalledWith(
					chalk.red( '✕' ),
					`File size cannot be more than ${ limit / 1024 / 1024 / 1024 } GB`,
					chalk.cyan( file )
				);
			} );
		} );

		it( 'should log correct messages for invalid_name_character_counts', () => {
			const errorType = 'invalid_name_character_counts';
			const invalidFiles = [ 'longfilename.png' ];
			const limit = 20;

			logErrors( { errorType, invalidFiles, limit } );

			invalidFiles.forEach( file => {
				expect( mockConsoleError ).toHaveBeenCalledWith(
					chalk.red( '✕' ),
					`File name cannot have more than ${ limit } characters`,
					chalk.cyan( file )
				);
			} );
		} );

		it( 'should log correct messages for invalid_names', () => {
			const errorType = 'invalid_names';
			const invalidFiles = [ 'invalid$file.txt' ];
			const limit = '';

			logErrors( { errorType, invalidFiles, limit } );

			invalidFiles.forEach( file => {
				expect( mockConsoleError ).toHaveBeenCalledWith(
					chalk.red( '✕' ),
					'Character validation: Invalid filename for file: ',
					chalk.cyan( file )
				);
			} );
		} );

		it( 'should not log anything if invalidFiles array is empty', () => {
			logErrors( { errorType: 'invalid_types', invalidFiles: [], limit: '' } );
			expect( mockConsoleError ).not.toHaveBeenCalled();
		} );
	} );
	describe( 'findNestedDirectories()', () => {
		// Mocking file system and chalk
		jest.mock( 'fs' );
		jest.mock( 'chalk', () => ( {
			red: jest.fn( () => 'red' ),
		} ) );

		let readdirSyncMock;
		let statSyncMock;

		beforeEach( () => {
			readdirSyncMock = jest.spyOn( fs, 'readdirSync' );
			statSyncMock = jest.spyOn( fs, 'statSync' );
		} );

		afterEach( () => {
			jest.resetAllMocks();
		} );

		it( 'should return undefined and log an error if the directory cannot be read', () => {
			const errorMessage = 'Reason: ENOTDIR: not a directory, scandir ~/Downloads/wp-content.zip';
			readdirSyncMock.mockImplementation( () => {
				throw new Error( errorMessage );
			} );

			console.error = jest.fn();

			const result = findNestedDirectories( '~/Downloads/wp-content.zip' );

			expect( result ).toBeUndefined();
			expect( console.error ).toHaveBeenCalledWith(
				chalk.red( '✕' ),
				` Error: Cannot read nested directory: ~/Downloads/wp-content.zip. Reason: ${ errorMessage }`
			);
		} );

		it( 'should return an empty result for an empty directory', () => {
			readdirSyncMock.mockReturnValue( [] );
			statSyncMock.mockReturnValue( { isDirectory: () => false } );

			const result = findNestedDirectories( '/empty/dir' );

			expect( result ).toEqual( { files: [], folderStructureObj: {} } );
		} );
	} );
} );
