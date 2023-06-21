/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { BackupDBCommand } from '../../src/commands/backup-db';
import API from '../../src/lib/api';

const mockApp = {
	id: 123,
	environments: [
		{
			id: 456,
			jobs: [
				{
					id: 123,
					type: 'db_backup',
					completedAt: '2020-01-01T00:00:00Z',
					createdAt: '2020-01-01T00:00:00Z',
					inProgressLock: false,
					metadata: [
						{
							name: 'backupName',
							value: 'test-backup',
						},
					],
					progress: {
						status: 'success',
					},
				},
			],
		},
	],
};

const queryMock = jest.fn();
queryMock.mockResolvedValue( {
	data: {
		app: mockApp,
	},
} );

const mutationMock = jest.fn();
mutationMock.mockResolvedValue( {
	data: {
		triggerDatabaseBackup: {
			success: true,
		},
	},
} );

jest.mock( '../../src/lib/api', () => jest.fn() );
API.mockImplementation( () => {
	return {
		query: queryMock,
		mutate: mutationMock,
	};
} );


describe( 'commands/BackupDBCommand', () => {
	beforeEach( () => {
	} );

	describe( '.loadBackupJob', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const cmd = new BackupDBCommand( app, env );
		const loadBackupJobSpy = jest.spyOn( cmd, 'loadBackupJob' );

		it( 'should return the latest backup job', async () => {
			const job = await cmd.loadBackupJob();
			expect( job ).toEqual( mockApp.environments[ 0 ].jobs[ 0 ] );
			expect( loadBackupJobSpy ).toHaveBeenCalled();
			expect( cmd.backupName ).toEqual( 'test-backup' );
		} );
	} );

	describe( '.run', () => {
		const app = { id: 123, name: 'test-app' };
		const env = { id: 456, name: 'test-env' };
		const cmd = new BackupDBCommand( app, env );
		const loadBackupJobSpy = jest.spyOn( cmd, 'loadBackupJob' );
		const logSpy = jest.spyOn( cmd, 'log' );

		it( 'should check if a backup is already running', async () => {
			loadBackupJobSpy.mockImplementationOnce( () => {
				cmd.job = { inProgressLock: true };
				cmd.backupName = 'test-backup';
				return cmd.job;
			} );

			await cmd.run();
			expect( logSpy ).toHaveBeenNthCalledWith( 1, 'Attaching to an already running backup job...' );
		} );
	} );
} );
