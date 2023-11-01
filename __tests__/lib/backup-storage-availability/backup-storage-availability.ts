import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Confirm } from 'enquirer';

import { BackupStorageAvailability } from '../../../src/lib/backup-storage-availability/backup-storage-availability';

const confirmRunSpy = jest.spyOn( Confirm.prototype, 'run' );

confirmRunSpy.mockResolvedValue( true );

const oneGiBInBytes = 1024 * 1024 * 1024;

describe( 'backup-storage-availability', () => {
	afterEach( () => {
		confirmRunSpy.mockClear();
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

			getStorageAvailableInVipPathSpy.mockResolvedValue( Math.round( oneGiBInBytes * 0.5 ) );

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

			getStorageAvailableInVipPathSpy.mockResolvedValue( Math.round( oneGiBInBytes * 1.1 ) );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForBackupImport()
			).resolves.toBe( true );

			expect( confirmRunSpy ).not.toHaveBeenCalled();
		} );
	} );

	describe( 'validateAndPromptDiskSpaceWarningForDevEnvBackupImport', () => {
		it.each( [
			{ dockerSpace: 10, vipSpace: 1, timesPrompted: 1 },
			{ dockerSpace: 1, vipSpace: 10, timesPrompted: 1 },
			{ dockerSpace: 4, vipSpace: 10, timesPrompted: 1 },
			{ dockerSpace: 10, vipSpace: 5, timesPrompted: 1 },
			{ dockerSpace: 0.5, vipSpace: 0.5, timesPrompted: 2 },
		] )(
			"should show a prompt if there's not enough space available - dockerSpace: $dockerSpace GiB, vipSpace: $vipSpace GiB",
			async ( { dockerSpace, vipSpace, timesPrompted } ) => {
				// backup size is 1 GiB
				const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
				jest
					.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
					.mockResolvedValue( Math.round( vipSpace * oneGiBInBytes ) );
				jest
					.spyOn( backupStorageAvailability, 'getDockerStorageAvailable' )
					.mockReturnValue( Math.round( dockerSpace * oneGiBInBytes ) );

				await expect(
					backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
				).resolves.toBe( true );

				expect( confirmRunSpy ).toHaveBeenCalledTimes( timesPrompted );
			}
		);

		it( 'should exit early if we press no on the first prompt', async () => {
			confirmRunSpy.mockResolvedValueOnce( false );
			// backup size is 1 GiB
			const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
			jest
				.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
				.mockResolvedValue( Math.round( 0.5 * oneGiBInBytes ) );
			jest
				.spyOn( backupStorageAvailability, 'getDockerStorageAvailable' )
				.mockReturnValue( Math.round( 0.5 * oneGiBInBytes ) );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
			).resolves.toBe( false );

			expect( confirmRunSpy ).toHaveBeenCalledTimes( 1 );
		} );

		it.each( [
			{ kiBRaw: '', vipSpace: 10, timesPrompted: 0 },
			{ kiBRaw: undefined, vipSpace: 10, timesPrompted: 0 },
			{ kiBRaw: '', vipSpace: 1, timesPrompted: 1 },
			{ kiBRaw: undefined, vipSpace: 1, timesPrompted: 1 },
		] )(
			'should not validate Docker Machine storage if the Docker Machine is not available - kiBRaw: $kiBRaw GiB, vipSpace: $vipSpace GiB',
			async ( { kiBRaw, vipSpace, timesPrompted } ) => {
				// backup size is 1 GiB
				const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
				jest
					.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
					.mockResolvedValue( Math.round( vipSpace * oneGiBInBytes ) );
				jest.spyOn( backupStorageAvailability, 'getDockerStorageKiBRaw' ).mockReturnValue( kiBRaw );

				await expect(
					backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
				).resolves.toBe( true );

				expect( confirmRunSpy ).toHaveBeenCalledTimes( timesPrompted );
			}
		);

		it( "should not show a prompt if there's enough space available", async () => {
			// backup size is 1 GiB
			const backupStorageAvailability = new BackupStorageAvailability( oneGiBInBytes );
			jest
				.spyOn( backupStorageAvailability, 'getStorageAvailableInVipPath' )
				.mockResolvedValue( Math.round( oneGiBInBytes * 10 ) );
			jest
				.spyOn( backupStorageAvailability, 'getDockerStorageAvailable' )
				.mockReturnValue( Math.round( oneGiBInBytes * 10 ) );

			await expect(
				backupStorageAvailability.validateAndPromptDiskSpaceWarningForDevEnvBackupImport()
			).resolves.toBe( true );

			expect( confirmRunSpy ).not.toHaveBeenCalled();
		} );
	} );
} );
