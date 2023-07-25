import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BackupStorageAvailability } from '../../../src/lib/backup-storage-availability/backup-storage-availability';
import { Confirm } from 'enquirer';

const confirmRunSpy = jest.spyOn( Confirm.prototype, 'run' );

confirmRunSpy.mockImplementation( () => {
	return Promise.resolve( true );
} );

const oneGiBInBytes = 1024 * 1024 * 1024;

describe( 'backup-storage-availability', () => {
	afterEach( () => {
		confirmRunSpy.mockReset();
	} );

	describe( 'validateAndPromptDiskSpaceWarningForBackupImport', () => {
		it( "should show a prompt if there's not enough space available", async () => {
			// backup size is 1 GiB
			const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
			const getStorageAvailableInVipPathSpy = jest.spyOn(
				backupStorageAvailability,
				'getStorageAvailableInVipPath'
			);
			// let's test with 0.5 GiB of available space.

			getStorageAvailableInVipPathSpy.mockImplementation( () => {
				return Promise.resolve( Math.round( oneGiBInBytes * 0.5 ) );
			} );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForBackupImport()
			).resolves.toBe( true );

			expect( confirmRunSpy ).toHaveBeenCalled();
		} );

		it( "should not show a prompt if there's enough space", async () => {
			// backup size is 1 GiB
			const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
			const getStorageAvailableInVipPathSpy = jest.spyOn(
				backupStorageAvailability,
				'getStorageAvailableInVipPath'
			);
			// let's test with 1.1 GiB of available space.

			getStorageAvailableInVipPathSpy.mockImplementation( () => {
				return Promise.resolve( Math.round( oneGiBInBytes * 1.1 ) );
			} );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForBackupImport()
			).resolves.toBe( true );

			expect( confirmRunSpy ).not.toHaveBeenCalled();
		} );
	} );

	describe( 'validateAndPromptDiskSpaceWarningForDevEnvBackupImport', () => {
		it.each( [
			{ dockerSpace: oneGiBInBytes * 10, vipSpace: oneGiBInBytes },
			{ dockerSpace: oneGiBInBytes, vipSpace: oneGiBInBytes * 10 },
			{ dockerSpace: oneGiBInBytes * 4, vipSpace: oneGiBInBytes * 10 },
			{ dockerSpace: oneGiBInBytes * 10, vipSpace: oneGiBInBytes * 5 },
		] )(
			"should show a prompt if there's not enough space available - dockerSpace: $dockerSpace , vipSpace: $vipSpace",
			async ( { dockerSpace, vipSpace } ) => {
				// backup size is 1 GiB
				const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
				jest
					.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
					.mockImplementation( () => {
						return Promise.resolve( Math.round( vipSpace ) );
					} );
				jest
					.spyOn( backupStorageAvailability, 'getDockerStorageAvailable' )
					.mockImplementation( () => {
						return Math.round( dockerSpace );
					} );

				await expect(
					backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
				).resolves.toBe( true );

				expect( confirmRunSpy ).toHaveBeenCalled();
			}
		);

		it( "should not show a prompt if there's enough space available", async () => {
			// backup size is 1 GiB
			const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
			jest
				.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
				.mockImplementation( async () => {
					return Promise.resolve( Math.round( oneGiBInBytes * 10 ) );
				} );
			jest
				.spyOn( backupStorageAvailability, 'getDockerStorageAvailable' )
				.mockImplementation( () => {
					return Math.round( oneGiBInBytes * 10 );
				} );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
			).resolves.toBe( true );

			expect( confirmRunSpy ).not.toHaveBeenCalled();
		} );
	} );
} );
