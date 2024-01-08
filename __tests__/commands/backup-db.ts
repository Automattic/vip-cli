/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-return */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

const queryMock = jest.fn( () => {
	return Promise.resolve( {
		data: {
			app: mockApp,
		},
	} );
} );

const mutationMock = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			triggerDatabaseBackup: {
				success: true,
			},
		},
	} );
} );

jest.mock( '../../src/lib/api' );
jest.mocked( API ).mockImplementation( () => {
	return Promise.resolve( {
		query: queryMock,
		mutate: mutationMock,
	} as any );
} );

describe( 'commands/BackupDBCommand', () => {
	beforeEach( () => {} );

	describe( '.loadBackupJob', () => {
		const app = { id: 123 };
		const env = { id: 456, jobs: [] };
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
		const app = { id: 123 };
		const env = { id: 456, jobs: [] };
		const cmd = new BackupDBCommand( app, env );
		const loadBackupJobSpy = jest.spyOn( cmd, 'loadBackupJob' );
		const logSpy = jest.spyOn( cmd, 'log' );

		it( 'should check if a backup is already running', async () => {
			loadBackupJobSpy.mockImplementationOnce( () => {
				cmd.job = { inProgressLock: true } as any;
				cmd.backupName = 'test-backup';
				return Promise.resolve( cmd.job as any );
			} );

			await cmd.run();
			expect( logSpy ).toHaveBeenCalledWith( 'Database backup already in progress...' );
		} );
	} );
} );
