import { exec } from 'shelljs';
import fs from 'fs';
import path from 'path';
import xdgBasedir from 'xdg-basedir';
import os from 'os';
import checkDiskSpace from 'check-disk-space';
import { Confirm, Select } from 'enquirer';
import { Job } from '../../graphqlTypes';

export class StorageAvailability {
	archiveSize: number;

	constructor( archiveSize: number ) {
		this.archiveSize = archiveSize;
	}

	static createFromDbCopyJob( job: Job ) {
		const bytesWrittenMeta = job.metadata?.find( meta => meta?.name === 'bytesWritten' );
		if ( ! bytesWrittenMeta?.value ) {
			throw new Error( 'Meta not found' );
		}

		return new StorageAvailability( Number( bytesWrittenMeta.value ) );
	}

	getDockerStorageAvailable() {
		const bytesLeft = exec( 'docker run --rm -it alpine df' )
			.exec( 'grep -i /dev/vda1 -m 1' )
			.replace( /\s+/g, ' ' )[ 3 ];

		return Number( bytesLeft );
	}

	bytesToHuman( bytes: number ) {
		const sizeInGiB = ( bytes / ( 1024 * 1024 * 1024 ) ).toFixed( 2 );
		return `${ sizeInGiB } GiB`;
	}

	async getStorageAvailableInVipPath() {
		const vipDir = path.join( xdgBasedir.data ?? os.tmpdir(), 'vip' );

		const diskSpace = await checkDiskSpace( vipDir );
		return diskSpace.free;
	}

	getReserveSpace() {
		// Reserve 1 GB of space
		return 1024 * 1024 * 1024;
	}

	getSqlSize() {
		// We estimated that it'd be about 3.5x the archive size.
		return this.archiveSize * 3.5;
	}

	getArchiveSize() {
		return this.archiveSize;
	}

	getStorageRequiredInMainMachine() {
		return this.getArchiveSize() + this.getSqlSize() + this.getReserveSpace();
	}

	getStorageRequiredInDockerMachine() {
		return this.getSqlSize() + this.getReserveSpace();
	}

	async isStorageAvailableInMainMachine() {
		return ( await this.getStorageAvailableInVipPath() ) > this.getStorageRequiredInMainMachine();
	}

	isStorageAvailableInDockerMachine() {
		return this.getDockerStorageAvailable() > this.getStorageRequiredInDockerMachine();
	}

	// eslint-disable-next-line id-length
	async validateAndPromptDiskSpaceWarningForBackupImport() {
		const isStorageAvailable =
			( await this.getStorageAvailableInVipPath() ) > this.getArchiveSize();
		if ( ! isStorageAvailable ) {
			const storageRequired = this.getArchiveSize();
			const confirmPrompt = new Confirm( {
				message: `We recommend that you have at least ${ this.bytesToHuman(
					storageRequired
				) } of free space in your machine to download this database backup. Do you still want to continue with downloading the database backup?`,
			} );

			return await confirmPrompt.run();
		}
	}

	// eslint-disable-next-line id-length
	async validateAndPromptDiskSpaceWarningForDevEnvBackupImport() {
		if ( ! ( await this.isStorageAvailableInMainMachine() ) ) {
			const storageRequired = this.getStorageRequiredInMainMachine();
			const confirmPrompt = new Confirm( {
				message: `We recommend that you have at least ${ this.bytesToHuman(
					storageRequired
				) } of free space in your machine to import this database backup. Do you still want to continue with importing the database backup?`,
			} );

			return await confirmPrompt.run();
		}

		if ( ! this.isStorageAvailableInDockerMachine() ) {
			const storageRequired = this.getStorageRequiredInDockerMachine();
			const confirmPrompt = new Confirm( {
				message: `We recommend that you have at least ${ this.bytesToHuman(
					storageRequired
				) } of free space in your Docker machine to import this database backup. Do you still want to continue with importing the database backup?`,
			} );

			return await confirmPrompt.run();
		}
	}
}
