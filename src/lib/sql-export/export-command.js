/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import fs from 'fs';
import https from 'https';
import path from 'path';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { getGlyphForStatus } from '../cli/format';
import { ProgressTracker } from '../cli/progress';
import * as exit from 'lib/cli/exit';
import { pollUntil } from 'lib/common';

const EXPORT_SQL_PROGRESS_POLL_INTERVAL = 1000;

const BACKUP_AND_JOB_STATUS_QUERY = gql`
	query AppBackupAndJobStatus( $appId: Int!, $envId: Int! ) {
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
 * @param {int} appId Application ID
 * @param {int} envId Environment ID
 * @resolves {Promise} A promise which resolves to the latest backup and job status
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
 * @param {int} appId Application ID
 * @param {int} envId Environment ID
 * @param {int} backupId Backup ID
 * @resolves {Promise} A promise which resolves to the download link
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
 * @param {int} appId Application ID
 * @param {int} envId Environment ID
 * @param {int} backupId Backup ID
 * @resolves {Promise} A promise which resolves to null if job creation succeeds
 * @throws {Error} Throws an error if the job creation fails
 */
async function createExportJob( appId, envId, backupId ) {
	const api = await API();
	const response = await api.mutate( {
		mutation: CREATE_EXPORT_JOB_MUTATION,
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
			startDBBackupCopy: { success },
		},
	} = response;

	if ( ! success ) {
		throw new Error();
	}
}

/**
 * Class representing an export command workflow
 */
export class ExportCommand {
	app;
	env;
	downloadLink;
	progressTracker;
	outputFile;

	/**
	 * Creates an instance of ExportCommand
	 * @param {object} app The application object
	 * @param {object} env The environment object
	 * @param {string} outputFile The output file path
	 * @constructor
	 */
	constructor( app, env, outputFile ) {
		this.app = app;
		this.env = env;
		this.outputFile = outputFile;
		this.progressTracker = new ProgressTracker( [
			{ id: 'prepare', name: 'Preparing' },
			{ id: 'create', name: 'Creating backup copy' },
			{ id: 'downloadLink', name: 'Requesting download link' },
			{ id: 'download', name: 'Downloading file' },
		] );
	}

	/**
	 * Fetches the export job of the latest backup
	 * @resolves {Promise} A promise which resolves to the export job
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
	 * @resolves {Promise} A promise which resolves to the filename
	 */
	async getExportedFileName() {
		const job = await this.getExportJob();
		const metadata = job.metadata.find( md => md.name === 'uploadPath' );
		return metadata?.value.split( '/' )[ 1 ];
	}

	/**
	 * Downloads the exported file
	 * @param {string} url The download URL
	 * @resolves {Promise} A promise which resolves to the path of the downloaded file
	 * @throws {Error} Throws an error if the download fails
	 */
	async downloadExportedFile( url ) {
		const filename = this.outputFile || ( await this.getExportedFileName() ) || 'exported.sql.gz';
		const file = fs.createWriteStream( filename );

		return new Promise( ( resolve, reject ) => {
			https.get( url, response => {
				response.pipe( file );

				file.on( 'finish', () => {
					file.close();
					resolve( path.resolve( file.path ) );
				} );

				file.on( 'error', err => {
					fs.unlink( filename );
					reject( err );
				} );
			} );
		} );
	}

	/**
	 * Checks if the export job's preflight step is successful
	 * @param {object} job The export job
	 * @returns {boolean} True if the preflight step is successful
	 */
	isPrepared( job ) {
		const step = job?.progress.steps.find( st => st.id === 'preflight' );
		return step?.status === 'success';
	}

	/**
	 * Checks if the export job's S3 upload step is successful
	 * @param {object} job The export job
	 * @returns {boolean} True if the upload step is successful
	 */
	isCreated( job ) {
		const step = job?.progress.steps.find( st => st.id === 'upload_backup' );
		return step?.status === 'success';
	}

	/**
	 * Stops the progress tracker
	 * @returns {void}
	 */
	stopProgressTracker() {
		this.progressTracker.print();
		this.progressTracker.stopPrinting();
	}

	/**
	 * Sequentially runs the steps of the export workflow
	 * @resolves {Promise} A promise which resolves to void
	 */
	async runSequence() {
		console.log( `Fetching the latest backup for ${ this.app.name }` );
		const { latestBackup } = await fetchLatestBackupAndJobStatus( this.app.id, this.env.id );

		if ( ! latestBackup ) {
			exit.withError( `No backup found for site ${ this.app.name }` );
		} else {
			console.log( `${ getGlyphForStatus( 'success' ) } Latest backup found with timestamp ${ latestBackup.createdAt }` );
		}

		// See if there is an existing export job for the latest backup
		if ( ! await this.getExportJob() ) {
			console.log( `Creating a new export for the backup with timestamp ${ latestBackup.createdAt }` );

			try {
				await createExportJob( this.app.id, this.env.id, latestBackup.id );
			} catch ( err ) {
				exit.withError( `Error creating export job: ${ err?.message }` );
			}
		} else {
			console.log( `Attaching to an existing export for the backup with timestamp ${ latestBackup.createdAt }` );
		}

		this.progressTracker.stepRunning( 'prepare' );
		this.progressTracker.startPrinting();

		await pollUntil( this.getExportJob.bind( this ), EXPORT_SQL_PROGRESS_POLL_INTERVAL, this.isPrepared.bind( this ) );
		this.progressTracker.stepSuccess( 'prepare' );

		await pollUntil( this.getExportJob.bind( this ), EXPORT_SQL_PROGRESS_POLL_INTERVAL, this.isCreated.bind( this ) );
		this.progressTracker.stepSuccess( 'create' );

		const url = await generateDownloadLink( this.app.id, this.env.id, latestBackup.id );
		this.progressTracker.stepSuccess( 'downloadLink' );

		// The export file is prepared. Let's download it
		try {
			const filepath = await this.downloadExportedFile( url );
			this.progressTracker.stepSuccess( 'download' );
			this.stopProgressTracker();
			console.log( `File saved to ${ filepath }` );
		} catch ( err ) {
			this.progressTracker.stepFailed( 'download' );
			this.stopProgressTracker();
			exit.withError( `Error downloading exported file: ${ err?.message }` );
		}
	}
}
