import chalk from 'chalk';

import { vipImportValidateFilesCmd } from '../../src/bin/vip-import-validate-files';
import { getMediaImportConfig } from '../../src/lib/media-import/config';
import {
	findNestedDirectories,
	isDirectory,
	validateFiles,
	logErrors,
} from '../../src/lib/vip-import-validate-files';

// Mock external dependencies
jest.mock( 'chalk', () => ( {
	red: jest.fn( msg => msg ),
} ) );

jest.mock( 'url', () => ( {
	parse: jest.fn( url => ( { path: url } ) ),
} ) );

// Mock internal dependencies
jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );
jest.mock( '../../src/lib/media-import/config', () => ( {
	getMediaImportConfig: jest.fn(),
} ) );
jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );
jest.mock( '../../src/lib/vip-import-validate-files', () => ( {
	findNestedDirectories: jest.fn(),
	folderStructureValidation: jest.fn(),
	isDirectory: jest.fn(),
	summaryLogs: jest.fn(),
	validateFiles: jest.fn(),
	logErrors: jest.fn(),
	ValidateFilesErrors: {
		INVALID_TYPES: 'INVALID_TYPES',
		INVALID_SIZES: 'INVALID_SIZES',
		INVALID_NAME_CHARACTER_COUNTS: 'INVALID_NAME_CHARACTER_COUNTS',
		INVALID_NAMES: 'INVALID_NAMES',
		INTERMEDIATE_IMAGES: 'INTERMEDIATE_IMAGES',
	},
} ) );

describe( 'vipImportValidateFilesCmd', () => {
	afterEach( () => {
		jest.clearAllMocks();
	} );

	it( 'should log an error if the given path is not a directory', async () => {
		isDirectory.mockResolvedValue( false );

		console.error = jest.fn();

		await vipImportValidateFilesCmd( [ 'wp-content/uploads/valid-invalid-path' ] );

		expect( console.error ).toHaveBeenCalledWith(
			chalk.red( '✕ Error:' ),
			'The given path is not a directory, please provide a valid directory path.'
		);
	} );

	it( 'should terminate if no nested files are found', async () => {
		isDirectory.mockResolvedValue( true );
		findNestedDirectories.mockReturnValue( null );

		await vipImportValidateFilesCmd( [ 'wp-content/uploads/valid-path' ] );

		expect( findNestedDirectories ).toHaveBeenCalledWith( 'wp-content/uploads/valid-path' );
	} );

	it( 'should log an error if media files directory is empty', async () => {
		isDirectory.mockResolvedValue( true );
		// there's no file in the directory
		findNestedDirectories.mockReturnValue( { files: [], folderStructureObj: {} } );

		console.error = jest.fn();

		await vipImportValidateFilesCmd( [ 'wp-content/uploads/empty-directory' ] );

		expect( console.error ).toHaveBeenCalledWith(
			chalk.red( '✕ Error:' ),
			'Media files directory cannot be empty'
		);
	} );

	it( 'should log an error if media import config cannot be retrieved', async () => {
		isDirectory.mockResolvedValue( true );
		findNestedDirectories.mockReturnValue( { files: [ 'any-file1.jpg' ], folderStructureObj: {} } );
		// getMediaImportConfig fails
		getMediaImportConfig.mockResolvedValue( null );

		console.error = jest.fn();

		await vipImportValidateFilesCmd( [ 'wp-content/uploads/valid-directory' ] );

		expect( console.error ).toHaveBeenCalledWith(
			chalk.red( '✕ Error:' ),
			'Could not retrieve validation metadata. Please contact VIP Support.'
		);
	} );

	it( 'should call validateFiles and log errors', async () => {
		isDirectory.mockResolvedValue( true );
		findNestedDirectories.mockReturnValue( {
			files: [ 'not-any-file1.jpg' ],
			folderStructureObj: {},
		} );
		getMediaImportConfig.mockResolvedValue( {
			allowedFileTypes: {},
			fileSizeLimitInBytes: 1000,
			fileNameCharCount: 255,
		} );
		validateFiles.mockResolvedValue( {
			intermediateImagesTotal: 0,
			errorFileTypes: [],
			errorFileNames: [],
			errorFileSizes: [],
			errorFileNamesCharCount: [],
			intermediateImages: {},
		} );

		await vipImportValidateFilesCmd( [ 'wp-content/uploads/valid-directory' ] );

		expect( validateFiles ).toHaveBeenCalledWith( [ 'not-any-file1.jpg' ], {
			allowedFileTypes: {},
			fileSizeLimitInBytes: 1000,
			fileNameCharCount: 255,
		} );

		expect( logErrors ).toHaveBeenCalledTimes( 5 ); // Log errors for all 5 types
	} );
} );
