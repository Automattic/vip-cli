import * as enquirer from 'enquirer';
import path from 'path';

import { validateAndGetTableNames, gates, promptToContinue } from '../../src/bin/vip-import-sql';
import * as exit from '../../src/lib/cli/exit';

jest.mock( '../../src/lib/tracker' );
jest.mock( '../../src/lib/validations/site-type' );
jest.mock( '../../src/lib/validations/is-multi-site' );
jest.mock( '../../src/lib/api/feature-flags' );
jest.mock( '../../src/lib/client-file-uploader', () => ( {
	getFileMeta: jest.fn().mockResolvedValue( {
		basename: 'test.sql',
		fileName: 'test.sql',
		fileSize: 1000,
		isCompressed: false,
	} ),
	checkFileAccess: jest.fn().mockResolvedValue( true ),
	getFileSize: jest.fn().mockResolvedValue( 1000 ),
	isFile: jest.fn().mockResolvedValue( true ),
} ) );
jest.mock( '../../src/lib/validations/sql', () => ( {
	validateImportFileExtension: jest.fn(),
	validateFilename: jest.fn(),
	staticSqlValidations: {
		execute: jest.fn(),
		postLineExecutionProcessing: jest.fn().mockResolvedValue( undefined ),
	},
	getTableNames: jest
		.fn()
		.mockReturnValue( [
			'wp_commentmeta',
			'wp_comments',
			'wp_links',
			'wp_options',
			'wp_postmeta',
			'wp_posts',
			'wp_term_relationships',
			'wp_term_taxonomy',
			'wp_termmeta',
			'wp_terms',
			'wp_usermeta',
			'wp_users',
		] ),
} ) );
jest.mock( '../../src/lib/validations/site-type', () => ( {
	siteTypeValidations: {
		execute: jest.fn(),
		postLineExecutionProcessing: jest.fn().mockResolvedValue( undefined ),
	},
} ) );
jest.mock( '../../src/lib/site-import/db-file-import', () => ( {
	currentUserCanImportForApp: jest.fn().mockReturnValue( true ),
	isSupportedApp: jest.fn().mockReturnValue( true ),
	SQL_IMPORT_FILE_SIZE_LIMIT: 200 * 1024 * 1024 * 1024, // 200GB
	SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED: 100 * 1024 * 1024 * 1024, // 100GB
} ) );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
jest.spyOn( console, 'log' ).mockImplementation( () => {} );

jest.mock( 'enquirer', () => ( {
	prompt: jest.fn(),
} ) );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
		command: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

const mockExitWithError = jest.spyOn( exit, 'withError' ).mockImplementation( message => {
	throw new Error( typeof message === 'string' ? message : message.message );
} );

// Import the mocked functions to access them in tests
const {
	getFileMeta,
	checkFileAccess,
	getFileSize,
	isFile,
} = require( '../../src/lib/client-file-uploader' );
const {
	validateImportFileExtension,
	validateFilename,
} = require( '../../src/lib/validations/sql' );

describe( 'vip-import-sql', () => {
	describe( 'validateAndGetTableNames', () => {
		it( 'returns an empty array when skipValidate is true', async () => {
			const params = {
				skipValidate: true,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validateAndGetTableNames( params );
			expect( result ).toEqual( [] );
		} );
		it( 'returns an array of table names that are contained within the input file', async () => {
			const params = {
				skipValidate: false,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validateAndGetTableNames( params );
			const expected = [
				'wp_commentmeta',
				'wp_comments',
				'wp_links',
				'wp_options',
				'wp_postmeta',
				'wp_posts',
				'wp_term_relationships',
				'wp_term_taxonomy',
				'wp_termmeta',
				'wp_terms',
				'wp_usermeta',
				'wp_users',
			];
			expect( result ).toEqual( expected );
		} );
	} );

	describe( 'gates', () => {
		const opts = {
			app: {
				id: 1,
				typeId: 2,
				organization: {
					id: 2,
				},
			},
			env: {
				id: 1,
				type: 'develop',
				importStatus: {
					dbOperationInProgress: false,
					importInProgress: false,
				},
			},
		};

		beforeEach( async () => {
			jest.clearAllMocks();

			// Set default successful mock implementations
			validateImportFileExtension.mockImplementation( () => {} );
			validateFilename.mockImplementation( () => {} );
			getFileMeta.mockResolvedValue( {
				basename: 'test.sql',
				fileName: 'test.sql',
				fileSize: 1000,
				isCompressed: false,
			} );
			checkFileAccess.mockResolvedValue( true );
			getFileSize.mockResolvedValue( 1000 );
			isFile.mockResolvedValue( true );
		} );

		describe( 'file imports', () => {
			it( 'fails if the import file has an invalid extension', async () => {
				const invalidFilePath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'empty.zip'
				);

				// Mock the validation to throw a string error for invalid extension
				validateImportFileExtension.mockImplementation( () => {
					throw 'Invalid file extension. Please provide a .sql or .gz file.';
				} );

				await expect( gates( opts.app, opts.env, invalidFilePath ) ).rejects.toThrow(
					'Invalid file extension. Please provide a .sql or .gz file.'
				);
			} );

			it.each( [ 'bad-sql-dump.sql.gz', 'bad-sql-dump.sql' ] )(
				'passes if the import file has a valid extension',
				async basename => {
					const validFilePath = path.join( process.cwd(), '__fixtures__', 'validations', basename );
					await expect( gates( opts.app, opts.env, validFilePath ) ).resolves.not.toThrow();
				}
			);

			it( 'warns if MD5 is provided for a file import', async () => {
				const consoleSpy = jest.spyOn( console, 'log' ).mockImplementation( () => {} );
				const validFilePath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-dump.sql'
				);

				await expect(
					gates( opts.app, opts.env, validFilePath, false, 'b5b39269e9105d6e1e9cd50ff54e6282' )
				).resolves.not.toThrow();

				expect( consoleSpy ).toHaveBeenCalledWith(
					expect.stringContaining( 'The --md5 parameter is only used for URL imports' )
				);
				consoleSpy.mockRestore();
			} );
		} );

		describe( 'URL imports', () => {
			it( 'fails if MD5 is not provided for URL import', async () => {
				const url = 'https://example.com/dump.sql';
				await expect( gates( opts.app, opts.env, url, true ) ).rejects.toThrow(
					'MD5 hash is required when importing from a URL. Please provide the --md5 parameter with a valid MD5 hash of the remote file.'
				);
			} );

			it( 'fails if MD5 is invalid for URL import', async () => {
				const url = 'https://example.com/dump.sql';
				await expect( gates( opts.app, opts.env, url, true, 'invalid-md5' ) ).rejects.toThrow(
					'The provided MD5 hash is invalid. It should be a 32-character hexadecimal string.'
				);
			} );

			it( 'fails if search/replace is provided with URL import', async () => {
				const url = 'https://example.com/dump.sql';
				await expect(
					gates( opts.app, opts.env, url, true, 'b5b39269e9105d6e1e9cd50ff54e6282', [
						'search,replace',
					] )
				).rejects.toThrow(
					'Search and replace operations are not supported when importing from a URL. Please remove the --search-replace option.'
				);
			} );

			it( 'passes with valid MD5 for URL import', async () => {
				const url = 'https://example.com/dump.sql';
				await expect(
					gates( opts.app, opts.env, url, true, 'b5b39269e9105d6e1e9cd50ff54e6282' )
				).resolves.not.toThrow();
			} );
		} );

		describe( 'environment validation', () => {
			it( 'fails if import is already in progress', async () => {
				const envWithImportInProgress = {
					...opts.env,
					importStatus: {
						...opts.env.importStatus,
						importInProgress: true,
					},
				};
				await expect( gates( opts.app, envWithImportInProgress, 'test.sql' ) ).rejects.toThrow(
					/There is already an import in progress/
				);
			} );

			it( 'fails if database operation is in progress', async () => {
				const envWithDbOpInProgress = {
					...opts.env,
					importStatus: {
						...opts.env.importStatus,
						dbOperationInProgress: true,
					},
				};
				await expect( gates( opts.app, envWithDbOpInProgress, 'test.sql' ) ).rejects.toThrow(
					'There is already a database operation in progress. Please try again later.'
				);
			} );

			it( 'fails if import status is missing', async () => {
				const envWithoutImportStatus = {
					...opts.env,
					importStatus: undefined,
				};
				await expect( gates( opts.app, envWithoutImportStatus, 'test.sql' ) ).rejects.toThrow(
					/Could not determine the import status/
				);
			} );
		} );
	} );

	describe( 'promptToContinue', () => {
		beforeEach( async () => {
			mockExitWithError.mockClear();
		} );

		it( 'does not exit with error upon correct input (exact case match)', async () => {
			const domain = 'example.com';
			const promptMock = jest
				.spyOn( enquirer, 'prompt' )
				.mockResolvedValueOnce( { confirmedDomain: domain.toUpperCase() } );

			await expect(
				promptToContinue( {
					launched: true,
					formattedEnvironment: 'development',
					track: jest.fn(),
					domain,
				} )
			).resolves.not.toThrow();

			expect( promptMock ).toHaveBeenCalled();
			promptMock.mockRestore();
		} );

		it( 'does not exit with error upon correct input (different case match)', async () => {
			const domain = 'example.com';
			const promptMock = jest
				.spyOn( enquirer, 'prompt' )
				.mockResolvedValueOnce( { confirmedDomain: domain.toLowerCase() } );

			await expect(
				promptToContinue( {
					launched: true,
					formattedEnvironment: 'development',
					track: jest.fn(),
					domain,
				} )
			).resolves.not.toThrow();

			expect( promptMock ).toHaveBeenCalled();
			promptMock.mockRestore();
		} );

		it( 'exits with error upon incorrect input', async () => {
			const domain = 'example.com';
			const promptMock = jest
				.spyOn( enquirer, 'prompt' )
				.mockResolvedValueOnce( { confirmedDomain: 'WRONG_INPUT' } );

			await expect(
				promptToContinue( {
					launched: true,
					formattedEnvironment: 'development',
					track: jest.fn(),
					domain,
				} )
			).rejects.toThrow(
				'The input did not match the expected environment label. Import aborted.'
			);

			expect( promptMock ).toHaveBeenCalled();
			promptMock.mockRestore();
		} );
	} );
} );
