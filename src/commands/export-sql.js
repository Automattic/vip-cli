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
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import { formatBytes, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import * as exit from '../lib/cli/exit';
import { getAbsolutePath, pollUntil } from '../lib/utils';

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
	steps = {
		PREPARE: 'prepare',
		CREATE: 'create',
		DOWNLOAD_LINK: 'downloadLink',
		DOWNLOAD: 'download',
	};
	track;

	/**
	 * Creates an instance of SQLExportCommand
	 *
	 * @param {any}      app        The application object
	 * @param {any}      env        The environment object
	 * @param {string}   outputFile The output file path
	 * @param {Function} trackerFn  The progress tracker function
	 */
	constructor( app, env, outputFile, trackerFn = () => {} ) {
		this.app = app;
		this.env = env;
		this.outputFile = typeof outputFile === 'string' ? getAbsolutePath( outputFile ) : null;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.PREPARE, name: 'Preparing' },
			{ id: this.steps.CREATE, name: 'Creating backup copy' },
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

	/**
	 * Sequentially runs the steps of the export workflow
	 *
	 * @return {Promise} A promise which resolves to void
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

		console.log( `Fetching the latest backup for ${ this.app.name }` );
		const { latestBackup } = await fetchLatestBackupAndJobStatus( this.app.id, this.env.id );

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

		if ( await this.getExportJob() ) {
			console.log(
				`Attaching to an existing export for the backup with timestamp ${ latestBackup.createdAt }`
			);
		} else {
			console.log(
				`Creating a new export for the backup with timestamp ${ latestBackup.createdAt }`
			);

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
