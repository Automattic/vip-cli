import checkDiskSpace from 'check-disk-space';
import { Confirm } from 'enquirer';
import os from 'os';
import path from 'path';
import { exec } from 'shelljs';
import xdgBasedir from 'xdg-basedir';

import { DockerMachineNotFoundError } from './docker-machine-not-found-error';
import { Job } from '../../graphqlTypes';
import { formatMetricBytes } from '../cli/format';

const oneGiBInBytes = 1024 * 1024 * 1024;

export interface PromptStatus {
	continue: boolean;
	isPromptShown: boolean;
}

export class BackupStorageAvailability {
	private archiveSize: number;

	constructor( archiveSize: number ) {
		this.archiveSize = archiveSize;
	}

	public static createFromDbCopyJob( job: Job ): BackupStorageAvailability {
		const bytesWrittenMeta = job.metadata?.find( meta => meta?.name === 'bytesWritten' );
		if ( ! bytesWrittenMeta?.value ) {
			throw new Error( 'Meta not found' );
		}

		return new BackupStorageAvailability( Number( bytesWrittenMeta.value ) );
	}

	public getDockerStorageKiBRaw(): string | undefined {
		return exec( `docker run --rm alpine df -k`, { silent: true } )
			.grep( /\/dev\/vda1/ )
			.head( { '-n': 1 } )
			.replace( /\s+/g, ' ' )
			.split( ' ' )[ 3 ];
	}

	public getDockerStorageAvailable(): number {
		const kiBLeft = this.getDockerStorageKiBRaw();

		if ( ! kiBLeft || Number.isNaN( Number( kiBLeft ) ) ) {
			throw new DockerMachineNotFoundError();
		}

		return Number( kiBLeft ) * 1024;
	}

	public bytesToHuman( bytes: number ) {
		return formatMetricBytes( bytes );
	}

	public async getStorageAvailableInVipPath() {
		const vipDir = path.join( xdgBasedir.data ?? os.tmpdir(), 'vip' );

		const diskSpace = await checkDiskSpace( vipDir );
		return diskSpace.free;
	}

	public getReserveSpace(): number {
		return oneGiBInBytes;
	}

	public getSqlSize(): number {
		// We estimated that it'd be about 3.5x the archive size.
		return this.archiveSize * 3.5;
	}

	public getArchiveSize(): number {
		return this.archiveSize;
	}

	public getStorageRequiredInMainMachine(): number {
		return this.getArchiveSize() + this.getSqlSize() + this.getReserveSpace();
	}

	public getStorageRequiredInDockerMachine(): number {
		return this.getSqlSize() + this.getReserveSpace();
	}

	public async isStorageAvailableInMainMachine(): Promise< boolean > {
		return ( await this.getStorageAvailableInVipPath() ) > this.getStorageRequiredInMainMachine();
	}

	public isStorageAvailableInDockerMachine(): boolean {
		return this.getDockerStorageAvailable() > this.getStorageRequiredInDockerMachine();
	}

	// eslint-disable-next-line id-length
	public async validateAndPromptDiskSpaceWarningForBackupImport(): Promise< PromptStatus > {
		const isStorageAvailable =
			( await this.getStorageAvailableInVipPath() ) > this.getArchiveSize();
		if ( ! isStorageAvailable ) {
			const storageRequired = this.getArchiveSize();
			const confirmPrompt = new Confirm( {
				message: `We recommend that you have at least ${ this.bytesToHuman(
					storageRequired
				) } of free space in your machine to download this database backup. Do you still want to continue with downloading the database backup?`,
			} );

			return {
				continue: await confirmPrompt.run(),
				isPromptShown: true,
			};
		}

		return {
			continue: true,
			isPromptShown: false,
		};
	}

	// eslint-disable-next-line id-length
	public async validateAndPromptDiskSpaceWarningForDevEnvBackupImport(): Promise< PromptStatus > {
		let storageAvailableInMainMachinePrompted = false;

		// there's two prompts, so as long as one prompt is shown, we need to set isPromptShown
		let isPromptShown = false;

		if ( ! ( await this.isStorageAvailableInMainMachine() ) ) {
			const storageRequired = this.getStorageRequiredInMainMachine();
			const storageAvailableInVipPath = this.bytesToHuman(
				await this.getStorageAvailableInVipPath()
			);

			const confirmPrompt = new Confirm( {
				message: `We recommend that you have at least ${ this.bytesToHuman(
					storageRequired
				) } of free space in your machine to import this database backup. We estimate that you currently have ${ storageAvailableInVipPath } of space in your machine.
Do you still want to continue with importing the database backup?
`,
			} );

			isPromptShown = true;

			storageAvailableInMainMachinePrompted = await confirmPrompt.run();

			if ( ! storageAvailableInMainMachinePrompted ) {
				return {
					continue: false,
					isPromptShown,
				};
			}
		}

		try {
			if ( ! this.isStorageAvailableInDockerMachine() ) {
				const storageRequired = this.getStorageRequiredInDockerMachine();
				const storageAvailableInDockerMachine = this.bytesToHuman(
					this.getDockerStorageAvailable()
				);
				const confirmPrompt = new Confirm( {
					message: `We recommend that you have at least ${ this.bytesToHuman(
						storageRequired
					) } of free space in your Docker machine to import this database backup. We estimate that you currently have ${ storageAvailableInDockerMachine } of space in your machine.
Do you still want to continue with importing the database backup?`,
				} );

				isPromptShown = true;

				return {
					continue: await confirmPrompt.run(),
					isPromptShown,
				};
			}
		} catch ( error ) {
			if ( error instanceof DockerMachineNotFoundError ) {
				// skip storage available check
				return {
					continue: true,
					isPromptShown,
				};
			}

			throw error;
		}

		return {
			continue: true,
			isPromptShown,
		};
	}
}
