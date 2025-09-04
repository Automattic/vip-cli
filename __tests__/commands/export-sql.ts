import fs from 'fs';

import {
	ExportSQLCommand,
	CREATE_EXPORT_JOB_MUTATION,
	GENERATE_DOWNLOAD_LINK_MUTATION,
} from '../../src/commands/export-sql';
import API from '../../src/lib/api';
import * as exit from '../../src/lib/cli/exit';
import * as downloadFileModule from '../../src/lib/http/download-file';
import {
	GENERATE_LIVE_BACKUP_DOWNLOAD_URL_MUTATION,
	START_LIVE_COPY_MUTATION,
} from '../../src/lib/live-backup-copy';
import { makeTempDir } from '../../src/lib/utils';

const mockApp = {
	id: 123,
	environments: [
		{
			id: 456,
			latestBackup: {
				id: 789,
				filename: 'test-backup.sql.gz',
				createdAt: '2020-01-01T00:00:00Z',
			},
			jobs: [
				{
					id: 123,
					type: 'db_backup_copy',
					completedAt: '2020-01-01T00:00:00Z',
					createdAt: '2020-01-01T00:00:00Z',
					inProgressLock: null,
					metadata: [
						{
							name: 'backupId',
							value: 789,
						},
						{
							name: 'uploadPath',
							value: 'db_backups/test-backup.sql.gz',
						},
						{
							name: 'bytesWritten',
							value: 1024000,
						},
					],
					progress: {
						status: 'finished',
						steps: [
							{
								id: 'preflight',
								status: 'success',
							},
							{
								id: 'upload_backup',
								status: 'success',
							},
						],
					},
				},
			],
		},
	],
};

// Mock graphql query for the latest backup and job status
const queryMock = jest.fn().mockImplementation( () => {
	return {
		data: {
			app: mockApp,
		},
	};
} );

const apiMutateMock = jest.fn().mockImplementation( ( { mutation } ) => {
	switch ( mutation ) {
		case GENERATE_DOWNLOAD_LINK_MUTATION:
			return {
				data: {
					generateDBBackupCopyUrl: {
						url: 'https://test-backup.sql.gz',
						success: true,
					},
				},
			};
		case CREATE_EXPORT_JOB_MUTATION:
			return {
				data: {
					startDBBackupCopy: {
						success: true,
						message: 'New job started',
					},
				},
			};
		case START_LIVE_COPY_MUTATION:
			return {
				data: {
					startLiveBackupCopy: {
						copyId: 'copy1234',
					},
				},
			};
		case GENERATE_LIVE_BACKUP_DOWNLOAD_URL_MUTATION:
			return {
				data: {
					generateLiveBackupCopyDownloadURL: {
						url: 'https://example.com/download/test.sql.gz',
						success: true,
						size: 123456,
						processing: false,
					},
				},
			};
		default:
			return {};
	}
} );

jest.mock( '../../src/lib/api', () => jest.fn() );
( jest.mocked( API ) as jest.SpyInstance ).mockImplementation( () => {
	return {
		query: queryMock,
		mutate: apiMutateMock,
	};
} );

jest.mock( '../../src/lib/cli/exit', () => ( {
	withError: jest.fn(),
} ) );

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'commands/ExportSQLCommand', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	describe( '.getExportJob', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const exportCommand = new ExportSQLCommand( app, env );

		it( 'should return the export job for the latest backup', async () => {
			const exportJob = await exportCommand.getExportJob();
			expect( exportJob ).toEqual( mockApp.environments[ 0 ].jobs[ 0 ] );
		} );

		it( 'should retry fetching export jobs', async () => {
			const queryMockThrowsError = jest.fn( () => {
				throw new Error( 'Unexpected token < in JSON at position 0' );
			} );

			jest.mocked( API as unknown as jest.SpyInstance ).mockImplementationOnce( () => {
				return {
					query: queryMockThrowsError,
				};
			} );
			const exportJob = await exportCommand.getExportJob();
			expect( exportJob ).toEqual( mockApp.environments[ 0 ].jobs[ 0 ] );
			expect( queryMockThrowsError ).toHaveBeenCalledTimes( 1 );
			expect( queryMock ).toHaveBeenCalledTimes( 1 );
		} );
	} );

	describe( '.getExportedFileName', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const exportCommand = new ExportSQLCommand( app, env );

		it( 'should return the filename for the latest backup', async () => {
			const exportFilename = await exportCommand.getExportedFileName();
			expect( exportFilename ).toEqual( 'test-backup.sql.gz' );
		} );
	} );

	describe( '.isPrepared', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const job = {
			id: 123,
			progress: {
				status: 'finished',
				steps: [
					{
						id: 'upload_backup',
						status: 'success',
					},
				],
			},
		};

		const exportCommand = new ExportSQLCommand( app, env );

		it( 'should return true if the S3 upload step has completed', () => {
			const isCreated = exportCommand.isCreated( job );
			expect( isCreated ).toEqual( true );
		} );

		it( 'should return false if the S3 upload step has not completed', () => {
			job.progress.steps[ 0 ].status = 'in_progress';
			const isCreated = exportCommand.isCreated( job );
			expect( isCreated ).toEqual( false );
		} );
	} );

	describe( '.isCreated', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const job = {
			id: 123,
			progress: {
				status: 'finished',
				steps: [
					{
						id: 'preflight',
						status: 'success',
					},
				],
			},
		};

		const exportCommand = new ExportSQLCommand( app, env );

		it( 'should return true if the preflight step has completed', () => {
			const isPrepared = exportCommand.isPrepared( job );
			expect( isPrepared ).toEqual( true );
		} );

		it( 'should return false if the preflight step has not completed', () => {
			job.progress.steps[ 0 ].status = 'in_progress';
			const isPrepared = exportCommand.isPrepared( job );
			expect( isPrepared ).toEqual( false );
		} );
	} );

	describe( '.run', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const exportCommand = new ExportSQLCommand( app, env );
		const stepSuccessSpy = jest.spyOn( exportCommand.progressTracker, 'stepSuccess' );
		const confirmEnoughStorageSpy = jest.spyOn( exportCommand, 'confirmEnoughStorage' );

		beforeAll( () => {
			confirmEnoughStorageSpy.mockResolvedValue( { continue: true, isPromptShown: false } );
		} );

		afterAll( () => {
			stepSuccessSpy.mockRestore();
			confirmEnoughStorageSpy.mockRestore();
		} );

		it( 'should sequentially run all the steps', async () => {
			const downloadMock = jest.spyOn( downloadFileModule, 'downloadFile' ).mockResolvedValue();

			await exportCommand.run();
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'prepare' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'create' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'confirmEnoughStorage' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'downloadLink' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'download' );
			expect( downloadMock ).toHaveBeenCalledWith(
				'https://test-backup.sql.gz',
				'exported.sql.gz',
				expect.any( Function )
			);
		} );
	} );

	describe( 'liveBackupCopy', () => {
		const tmpDir = makeTempDir();

		const configFile = `${ tmpDir }/test-live-backup-config.json`;
		const outputFile = `${ tmpDir }/sql-export.sql.gz`;
		const mockConfig = {
			tool: 'mysqldump',
			type: 'tables',
			tables: {
				wp_users: { where: 'ID > 10', replace: true },
				wp_posts: { 'skip-add-drop-table': true },
				wp_options: {},
			},
		};

		beforeEach( () => {
			fs.writeFileSync( configFile, JSON.stringify( mockConfig ) );
		} );

		afterEach( () => {
			jest.clearAllMocks();

			if ( fs.existsSync( configFile ) ) {
				fs.unlinkSync( configFile );
			}
		} );

		it( 'should successfully create backup copy and download file', async () => {
			const app = { id: 123, name: 'test-app' };
			const env = { id: 456, name: 'test-env' };

			const mockDownloadURL = 'https://example.com/download/test.sql.gz';

			const exportCommand = new ExportSQLCommand( app, env, {
				liveBackupCopyCLIOptions: {
					useLiveBackupCopy: true,
					configFile,
				},
				outputFile,
			} );

			const mockDownloadFile = jest.spyOn( downloadFileModule, 'downloadFile' );
			mockDownloadFile.mockImplementation( () => {
				return new Promise( resolve => {
					resolve();
				} );
			} );

			await exportCommand.run();

			expect( apiMutateMock ).toHaveBeenCalledWith( {
				mutation: START_LIVE_COPY_MUTATION,
				variables: {
					input: {
						id: 123,
						environmentId: 456,
						config: {
							tool: 'mysqldump',
							type: 'tables',
							tables: {
								wp_users: {
									where: 'ID > 10',
									replace: true,
								},
								wp_posts: {
									'skip-add-drop-table': true,
								},
								wp_options: {},
							},
						},
					},
				},
			} );

			expect( mockDownloadFile ).toHaveBeenCalledWith(
				mockDownloadURL,
				expect.stringMatching( /\/sql-export.sql.gz$/ ),
				expect.any( Function )
			);
		} );

		it( 'should successfully create backup for specific tables and download file', async () => {
			const app = { id: 123, name: 'test-app' };
			const env = { id: 456, name: 'test-env' };

			const mockDownloadURL = 'https://example.com/download/test.sql.gz';

			const exportCommand = new ExportSQLCommand( app, env, {
				liveBackupCopyCLIOptions: {
					useLiveBackupCopy: true,
					tables: [ 'wp_users', 'wp_posts' ],
				},
				outputFile,
			} );

			const mockDownloadFile = jest.spyOn( downloadFileModule, 'downloadFile' );
			mockDownloadFile.mockImplementation( () => {
				return new Promise( resolve => {
					resolve();
				} );
			} );

			await exportCommand.run();

			expect( apiMutateMock ).toHaveBeenCalledWith( {
				mutation: START_LIVE_COPY_MUTATION,
				variables: {
					input: {
						id: 123,
						environmentId: 456,
						config: {
							site_ids: undefined,
							type: 'tables',
							tables: {
								wp_users: {},
								wp_posts: {},
							},
							wpcli_command: undefined,
						},
					},
				},
			} );

			expect( mockDownloadFile ).toHaveBeenCalledWith(
				mockDownloadURL,
				expect.stringMatching( /\/sql-export.sql.gz$/ ),
				expect.any( Function )
			);
		} );

		it( 'should successfully create backup for specific network sites and download file', async () => {
			const app = { id: 123, name: 'test-app' };
			const env = { id: 456, name: 'test-env' };

			const mockDownloadURL = 'https://example.com/download/test.sql.gz';

			const exportCommand = new ExportSQLCommand( app, env, {
				liveBackupCopyCLIOptions: {
					useLiveBackupCopy: true,
					siteIds: [ 2, 3 ],
				},
				outputFile,
			} );

			const mockDownloadFile = jest.spyOn( downloadFileModule, 'downloadFile' );
			mockDownloadFile.mockImplementation( () => {
				return new Promise( resolve => {
					resolve();
				} );
			} );

			await exportCommand.run();

			expect( apiMutateMock ).toHaveBeenCalledWith( {
				mutation: START_LIVE_COPY_MUTATION,
				variables: {
					input: {
						id: 123,
						environmentId: 456,
						config: {
							site_ids: [ 2, 3 ],
							type: 'site_ids',
							tables: undefined,
							wpcli_command: undefined,
						},
					},
				},
			} );

			expect( mockDownloadFile ).toHaveBeenCalledWith(
				mockDownloadURL,
				expect.stringMatching( /\/sql-export.sql.gz$/ ),
				expect.any( Function )
			);
		} );

		it( 'should successfully create backup for specific wpcli command and download file', async () => {
			const app = { id: 123, name: 'test-app' };
			const env = { id: 456, name: 'test-env' };

			const mockDownloadURL = 'https://example.com/download/test.sql.gz';

			const exportCommand = new ExportSQLCommand( app, env, {
				liveBackupCopyCLIOptions: {
					useLiveBackupCopy: true,
					wpcliCommand: 'custom-db-export-config --include-users --include-posts',
				},
				outputFile,
			} );

			const mockDownloadFile = jest.spyOn( downloadFileModule, 'downloadFile' );
			mockDownloadFile.mockImplementation( () => {
				return new Promise( resolve => {
					resolve();
				} );
			} );

			await exportCommand.run();

			expect( apiMutateMock ).toHaveBeenCalledWith( {
				mutation: START_LIVE_COPY_MUTATION,
				variables: {
					input: {
						id: 123,
						environmentId: 456,
						config: {
							site_ids: undefined,
							type: 'wpcli_command',
							tables: undefined,
							wpcli_command: 'custom-db-export-config --include-users --include-posts',
						},
					},
				},
			} );

			expect( mockDownloadFile ).toHaveBeenCalledWith(
				mockDownloadURL,
				expect.stringMatching( /\/sql-export.sql.gz$/ ),
				expect.any( Function )
			);
		} );

		it( 'should handle error during getDownloadURL', async () => {
			const app = { id: 123, name: 'test-app' };
			const env = { id: 456, name: 'test-env' };

			const mockTracker = jest.fn();

			const exportCommand = new ExportSQLCommand(
				app,
				env,
				{
					liveBackupCopyCLIOptions: {
						useLiveBackupCopy: true,
						configFile,
					},
					outputFile,
				},
				mockTracker
			);

			const mockDownloadFile = jest.spyOn( downloadFileModule, 'downloadFile' );
			mockDownloadFile.mockImplementation( () => {
				throw new Error( 'ops!!!' );
			} );

			await exportCommand.run();

			expect( mockTracker ).toHaveBeenCalledWith(
				'error',
				expect.objectContaining( {
					error_type: 'download_failed',
					error_message: 'ops!!!',
				} )
			);
			expect( exit.withError ).toHaveBeenCalledWith( 'Error downloading exported file: ops!!!' );
		} );
	} );
} );
