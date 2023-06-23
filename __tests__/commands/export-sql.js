/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import {
	ExportSQLCommand,
	CREATE_EXPORT_JOB_MUTATION,
	GENERATE_DOWNLOAD_LINK_MUTATION,
} from '../../src/commands/export-sql';
import API from '../../src/lib/api';

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

jest.mock( '../../src/lib/api', () => jest.fn() );
API.mockImplementation( () => {
	return {
		query: queryMock,
		mutate: jest.fn().mockImplementation( ( { mutation } ) => {
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
				default:
					return {};
			}
		} ),
	};
} );

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'commands/ExportSQLCommand', () => {
	beforeEach( () => {} );

	describe( '.getExportJob', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const exportCommand = new ExportSQLCommand( app, env );

		it( 'should return the export job for the latest backup', async () => {
			const exportJob = await exportCommand.getExportJob();
			expect( exportJob ).toEqual( mockApp.environments[ 0 ].jobs[ 0 ] );
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

		it( 'should return true if the S3 upload step has completed', async () => {
			const isCreated = await exportCommand.isCreated( job );
			expect( isCreated ).toEqual( true );
		} );

		it( 'should return false if the S3 upload step has not completed', async () => {
			job.progress.steps[ 0 ].status = 'in_progress';
			const isCreated = await exportCommand.isCreated( job );
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

		it( 'should return true if the preflight step has completed', async () => {
			const isPrepared = await exportCommand.isPrepared( job );
			expect( isPrepared ).toEqual( true );
		} );

		it( 'should return false if the preflight step has not completed', async () => {
			job.progress.steps[ 0 ].status = 'in_progress';
			const isPrepared = await exportCommand.isPrepared( job );
			expect( isPrepared ).toEqual( false );
		} );
	} );

	describe( '.run', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const exportCommand = new ExportSQLCommand( app, env );
		const downloadSpy = jest.spyOn( exportCommand, 'downloadExportedFile' );
		const stepSuccessSpy = jest.spyOn( exportCommand.progressTracker, 'stepSuccess' );

		beforeAll( () => {
			downloadSpy.mockResolvedValue( 'test-backup.sql.gz' );
		} );

		afterAll( () => {
			downloadSpy.mockRestore();
			stepSuccessSpy.mockRestore();
		} );

		it( 'should sequentially run all the steps', async () => {
			await exportCommand.run();
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'prepare' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'create' );
			expect( stepSuccessSpy ).toHaveBeenCalledWith( 'downloadLink' );
			expect( downloadSpy ).toHaveBeenCalledWith( 'https://test-backup.sql.gz' );
		} );
	} );
} );
