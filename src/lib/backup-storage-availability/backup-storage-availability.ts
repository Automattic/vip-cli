import { exec } from 'shelljs';
import path from 'path';
import xdgBasedir from 'xdg-basedir';
import os from 'os';
import checkDiskSpace from 'check-disk-space';
import { Confirm } from 'enquirer';
import { Job } from '../../graphqlTypes';

const oneGiBInBytes = 1024 * 1024 * 1024;

export class BackupStorageAvailability {
	archiveSize: number;

	constructor( archiveSize: number ) {
		this.archiveSize = archiveSize;
	}

	static createFromDbCopyJob( job: Job ): BackupStorageAvailability {
		const bytesWrittenMeta = job.metadata?.find( meta => meta?.name === 'bytesWritten' );
		if ( ! bytesWrittenMeta?.value ) {
			throw new Error( 'Meta not found' );
		}

		return new BackupStorageAvailability( Number( bytesWrittenMeta.value ) );
	}

	getDockerStorageAvailable(): number {
		const bytesLeft = exec( `docker run --rm alpine df`, { silent: true } )
			.grep( /\/dev\/vda1/ )
			.head( { '-n': 1 } )
			.replace( /\s+/g, ' ' )
			.split( ' ' )[ 3 ];

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

	getReserveSpace(): number {
		return oneGiBInBytes;
	}

	getSqlSize(): number {
		// We estimated that it'd be about 3.5x the archive size.
		return this.archiveSize * 3.5;
	}

	getArchiveSize(): number {
		return this.archiveSize;
	}

	getStorageRequiredInMainMachine(): number {
		return this.getArchiveSize() + this.getSqlSize() + this.getReserveSpace();
	}

	getStorageRequiredInDockerMachine(): number {
		return this.getSqlSize() + this.getReserveSpace();
	}

	async isStorageAvailableInMainMachine(): Promise< boolean > {
		return ( await this.getStorageAvailableInVipPath() ) > this.getStorageRequiredInMainMachine();
	}

	isStorageAvailableInDockerMachine(): boolean {
		return this.getDockerStorageAvailable() > this.getStorageRequiredInDockerMachine();
	}

	// eslint-disable-next-line id-length
	async validateAndPromptDiskSpaceWarningForBackupImport(): Promise< boolean > {
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

		return true;
	}

	// eslint-disable-next-line id-length
	async validateAndPromptDiskSpaceWarningForDevEnvBackupImport(): Promise< boolean > {
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

		return true;
	}
}
