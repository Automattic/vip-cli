/**
 * External dependencies
 */
import gql from 'graphql-tag';
import fs from 'fs';
import https from 'https';
import path from 'path';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import { formatBytes, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import * as exit from '../lib/cli/exit';
import { getAbsolutePath, pollUntil } from '../lib/utils';
import { BackupDBCommand } from './backup-db';
import { BackupStorageAvailability } from '../lib/backup-storage-availability/backup-storage-availability';

const EXPORT_SQL_PROGRESS_POLL_INTERVAL = 1000;

const BACKUP_AND_JOB_STATUS_QUERY = gql`
	query AppBackupAndJobStatus($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			id
			environments(id: $envId) {
				id
				latestBackup {
					id
					type
					size
					filename
					createdAt
				}
				jobs(jobTypes: [db_backup_copy]) {
					id
					type
					completedAt
					createdAt
					inProgressLock
					metadata {
						name
						value
					}
					progress {
						status
						steps {
							id
							name
							step
							status
						}
					}
				}
			}
		}
	}
`;

// Exporting for test purposes
export const GENERATE_DOWNLOAD_LINK_MUTATION = gql`
	mutation GenerateDBBackupCopyUrl($input: AppEnvironmentGenerateDBBackupCopyUrlInput) {
		generateDBBackupCopyUrl(input: $input) {
			url
			success
		}
	}
`;

// Exporting for test purposes
export const CREATE_EXPORT_JOB_MUTATION = gql`
	mutation BackupDBCopy($input: AppEnvironmentStartDBBackupCopyInput) {
		startDBBackupCopy(input: $input) {
			message
			success
		}
	}
`;

/**
 * Fetches the latest backup and job status for an environment
 *
 * @param {number} appId Application ID
 * @param {number} envId Environment ID
 * @return {Promise} A promise which resolves to the latest backup and job status
 */
async function fetchLatestBackupAndJobStatus( appId, envId ) {
	const api = await API();

	const response = await api.query( {
		query: BACKUP_AND_JOB_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const {
		data: {
			app: { environments },
		},
	} = response;

	const latestBackup = environments[ 0 ].latestBackup;
	const jobs = environments[ 0 ].jobs;

	return { latestBackup, jobs };
}

/**
 * Generates a download link for a backup
 *
 * @param {number} appId    Application ID
 * @param {number} envId    Environment ID
 * @param {number} backupId Backup ID
 * @return {Promise} A promise which resolves to the download link
 */
async function generateDownloadLink( appId, envId, backupId ) {
	const api = await API();
	const response = await api.mutate( {
		mutation: GENERATE_DOWNLOAD_LINK_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				backupId,
			},
		},
	} );

	const {
		data: {
			generateDBBackupCopyUrl: { url },
		},
	} = response;

	return url;
}

/**
 * Creates an export job for a backup
 *
 * @param {number} appId    Application ID
 * @param {number} envId    Environment ID
 * @param {number} backupId Backup ID
 * @return {Promise} A promise which resolves to null if job creation succeeds
 * @throws {Error} Throws an error if the job creation fails
 */
async function createExportJob( appId, envId, backupId ) {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();
	await api.mutate( {
		mutation: CREATE_EXPORT_JOB_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				backupId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();
}

/**
 * Class representing an export command workflow
 */
export class ExportSQLCommand {
	app;
	env;
	downloadLink;
	progressTracker;
	outputFile;
	generateBackup;
	confirmEnoughStorageHook;
	steps = {
		PREPARE: 'prepare',
		CREATE: 'create',
		DOWNLOAD_LINK: 'downloadLink',
		CONFIRM_ENOUGH_STORAGE: 'confirmEnoughStorage',
		DOWNLOAD: 'download',
	};
	track;

	/**
	 * Creates an instance of SQLExportCommand
	 *
	 * @param {any}      app        The application object
	 * @param {any}      env        The environment object
	 * @param {object}   options 		The optional parameters
	 * @param {Function} trackerFn  The progress tracker function
	 */
	constructor( app, env, options = {}, trackerFn = () => {} ) {
		this.app = app;
		this.env = env;
		this.outputFile =
			typeof options.outputFile === 'string' ? getAbsolutePath( options.outputFile ) : null;
		this.confirmEnoughStorageHook = options.confirmEnoughStorageHook;
		this.generateBackup = options.generateBackup || false;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.PREPARE, name: 'Preparing for backup download' },
			{ id: this.steps.CREATE, name: 'Creating backup copy' },
			{ id: this.steps.CONFIRM_ENOUGH_STORAGE, name: "Checking if there's enough storage" },
			{ id: this.steps.DOWNLOAD_LINK, name: 'Requesting download link' },
			{ id: this.steps.DOWNLOAD, name: 'Downloading file' },
		] );
		this.track = trackerFn;
	}

	/**
	 * Fetches the export job of the latest backup
	 *
	 * @return {Promise} A promise which resolves to the export job
	 */
	async getExportJob() {
		const { latestBackup, jobs } = await fetchLatestBackupAndJobStatus( this.app.id, this.env.id );

		// Find the job that generates the export for the latest backup
		return jobs.find( job => {
			const metadata = job.metadata.find( md => md.name === 'backupId' );
			return metadata && parseInt( metadata.value, 10 ) === latestBackup.id;
		} );
	}

	/**
	 * Fetches the S3 filename of the exported backup
	 *
	 * @return {Promise} A promise which resolves to the filename
	 */
	async getExportedFileName() {
		const job = await this.getExportJob();
		const metadata = job.metadata.find( md => md.name === 'uploadPath' );
		return metadata?.value.split( '/' )[ 1 ];
	}

	/**
	 * Downloads the exported file
	 *
	 * @param {string} url The download URL
	 * @return {Promise} A promise which resolves to the path of the downloaded file
	 * @throws {Error} Throws an error if the download fails
	 */
	async downloadExportedFile( url ) {
		const filename = this.outputFile || ( await this.getExportedFileName() ) || 'exported.sql.gz';
		const file = fs.createWriteStream( filename );

		return new Promise( ( resolve, reject ) => {
			https.get( url, response => {
				response.pipe( file );
				const total = parseInt( response.headers[ 'content-length' ], 10 );
				let current = 0;

				file.on( 'finish', () => {
					file.close();
					resolve( path.resolve( file.path ) );
				} );

				file.on( 'error', err => {
					fs.unlink( filename );
					reject( err );
				} );

				response.on( 'data', chunk => {
					current += chunk.length;
					this.progressTracker.setProgress(
						`- ${ ( ( 100 * current ) / total ).toFixed( 2 ) }% (${ formatBytes(
							current
						) }/${ formatBytes( total ) })`
					);
				} );
			} );
		} );
	}

	/**
	 * Checks if the export job's preflight step is successful
	 *
	 * @param {any} job The export job
	 * @return {boolean} True if the preflight step is successful
	 */
	isPrepared( job ) {
		const step = job?.progress.steps.find( st => st.id === 'preflight' );
		return step?.status === 'success';
	}

	/**
	 * Checks if the export job's S3 upload step is successful
	 *
	 * @param {any} job The export job
	 * @return {boolean} True if the upload step is successful
	 */
	isCreated( job ) {
		const step = job?.progress.steps.find( st => st.id === 'upload_backup' );
		return step?.status === 'success';
	}

	/**
	 * Stops the progress tracker
	 *
	 * @return {void}
	 */
	stopProgressTracker() {
		this.progressTracker.print();
		this.progressTracker.stopPrinting();
	}

	async runBackupJob() {
		const cmd = new BackupDBCommand( this.app, this.env );

		let noticeMessage = `\n${ chalk.yellow( 'NOTICE: ' ) }`;
		noticeMessage +=
			'If a recent database backup does not exist, a new one will be generated for this environment. ';
		noticeMessage +=
			'Learn more about this: https://docs.wpvip.com/technical-references/vip-dashboard/backups/#2-download-a-full-database-backup \n';
		this.log( noticeMessage );

		await cmd.run( false );
	}

	async confirmEnoughStorage( job ) {
		if ( this.confirmEnoughStorageHook ) {
			return await this.confirmEnoughStorageHook( job );
		}

		const storageAvailability = BackupStorageAvailability.createFromDbCopyJob( job );
		return await storageAvailability.validateAndPromptDiskSpaceWarningForBackupImport();
	}

	/**
	 * Sequentially runs the steps of the export workflow
	 *
	 */
	async run() {
		if ( this.outputFile ) {
			try {
				fs.accessSync( path.parse( this.outputFile ).dir, fs.constants.W_OK );
			} catch ( err ) {
				await this.track( 'error', {
					error_type: 'cannot_write_to_path',
					error_message: `Cannot write to the specified path: ${ err?.message }`,
					stack: err?.stack,
				} );
				exit.withError( `Cannot write to the specified path: ${ err?.message }` );
			}
		}

		if ( this.generateBackup ) {
			await this.runBackupJob();
		}

		const { latestBackup } = await fetchLatestBackupAndJobStatus( this.app.id, this.env.id );

		if ( ! this.generateBackup ) {
			if ( ! latestBackup ) {
				await this.track( 'error', {
					error_type: 'no_backup_found',
					error_message: 'No backup found for the site',
				} );
				exit.withError( `No backup found for site ${ this.app.name }` );
			} else {
				console.log(
					`${ getGlyphForStatus( 'success' ) } Latest backup found with timestamp ${
						latestBackup.createdAt
					}`
				);
			}
		} else {
			console.log(
				`${ getGlyphForStatus( 'success' ) } Backup created with timestamp ${
					latestBackup.createdAt
				}`
			);
		}

		if ( await this.getExportJob() ) {
			console.log(
				`Attaching to an existing export for the backup with timestamp ${ latestBackup.createdAt }`
			);
		} else {
			console.log( `Exporting database backup with timestamp ${ latestBackup.createdAt }` );

			try {
				await createExportJob( this.app.id, this.env.id, latestBackup.id );
			} catch ( err ) {
				// Todo: match error code instead of message substring
				if ( err?.message.includes( 'Backup Copy already in progress' ) ) {
					await this.track( 'error', {
						error_type: 'job_already_running',
						error_message: err?.message,
						stack: err?.stack,
					} );
					exit.withError(
						'There is an export job already running for this environment: ' +
							`https://dashboard.wpvip.com/apps/${ this.app.id }/${ this.env.uniqueLabel }/data/database/backups\n` +
							'Currently, we allow only one export job at a time, per site. Please try again later.'
					);
				} else {
					await this.track( 'error', {
						error_type: 'create_export_job',
						error_message: err?.message,
						stack: err?.stack,
					} );
				}
				exit.withError( `Error creating export job: ${ err?.message }` );
			}
		}

		this.progressTracker.stepRunning( this.steps.PREPARE );
		this.progressTracker.startPrinting();

		await pollUntil(
			this.getExportJob.bind( this ),
			EXPORT_SQL_PROGRESS_POLL_INTERVAL,
			this.isPrepared.bind( this )
		);
		this.progressTracker.stepSuccess( this.steps.PREPARE );

		await pollUntil(
			this.getExportJob.bind( this ),
			EXPORT_SQL_PROGRESS_POLL_INTERVAL,
			this.isCreated.bind( this )
		);
		this.progressTracker.stepSuccess( this.steps.CREATE );

		const storageConfirmed = await this.progressTracker.handleContinuePrompt( async () => {
			return await this.confirmEnoughStorage( await this.getExportJob() );
		}, 3 );

		if ( storageConfirmed ) {
			this.progressTracker.stepSuccess( this.steps.CONFIRM_ENOUGH_STORAGE );
		} else {
			this.progressTracker.stepFailed( this.steps.CONFIRM_ENOUGH_STORAGE );
			this.stopProgressTracker();
			exit.withError( 'Command canceled by user.' );
		}

		const url = await generateDownloadLink( this.app.id, this.env.id, latestBackup.id );
		this.progressTracker.stepSuccess( this.steps.DOWNLOAD_LINK );

		// The export file is prepared. Let's download it
		try {
			const filepath = await this.downloadExportedFile( url );
			this.progressTracker.stepSuccess( this.steps.DOWNLOAD );
			this.stopProgressTracker();
			console.log( `File saved to ${ filepath }` );
		} catch ( err ) {
			this.progressTracker.stepFailed( this.steps.DOWNLOAD );
			this.stopProgressTracker();
			await this.track( 'error', {
				error_type: 'download_failed',
				error_message: err?.message,
				stack: err?.stack,
			} );
			exit.withError( `Error downloading exported file: ${ err?.message }` );
		}
	}
}
