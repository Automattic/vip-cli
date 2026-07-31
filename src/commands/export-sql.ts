import chalk from 'chalk';
import fs from 'fs';
import gql from 'graphql-tag';
import path from 'path';

import { BackupDBCommand } from './backup-db';
import {
	AppBackupAndJobStatusQuery,
	GenerateDbBackupCopyUrlMutation,
} from './export-sql.generated';
import { App, AppEnvironment, Backup, Job } from '../graphqlTypes';
import { TrackFunction } from '../lib/analytics/clients/tracks';
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import {
	BackupStorageAvailability,
	PromptStatus,
} from '../lib/backup-storage-availability/backup-storage-availability';
import * as exit from '../lib/cli/exit';
import { formatBytes } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import { downloadFile, OnProgressCallback } from '../lib/http/download-file';
import * as liveBackupCopy from '../lib/live-backup-copy';
import {
	LiveBackupCopyCLIOptions,
	DBLiveCopyConfig,
	BackupLiveCopyType,
} from '../lib/live-backup-copy';
import { retry } from '../lib/retry';
import UserError from '../lib/user-error';
import { getAbsolutePath, pollUntil, parseApiError } from '../lib/utils';

const EXPORT_SQL_PROGRESS_POLL_INTERVAL = 1000;

// Maximum allowed size for a live backup copy configuration file (500 KB).
const MAX_LIVE_BACKUP_CONFIG_SIZE_BYTES = 500 * 1024;

const BACKUP_AND_JOB_STATUS_QUERY = gql`
	query AppBackupAndJobStatus($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			id
			environments(id: $envId) {
				id
				backupsSqlDumpTool
				latestBackup {
					id
					type
					size
					filename
					sqlDumpTool
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
async function fetchLatestBackupAndJobStatusBase(
	appId: number,
	envId: number
): Promise< {
	latestBackup: Backup | undefined;
	jobs: Job[];
	envSqlDumpTool: string | null | undefined;
} > {
	const api = API();

	const response = await api.query< AppBackupAndJobStatusQuery >( {
		query: BACKUP_AND_JOB_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const environments = response.data?.app?.environments;
	const firstEnvironment = environments?.[ 0 ];
	const envSqlDumpTool = firstEnvironment?.backupsSqlDumpTool;

	const latestBackup = firstEnvironment?.latestBackup ?? undefined;
	const jobs = ( firstEnvironment?.jobs || [] ) as Job[];

	return { latestBackup, jobs, envSqlDumpTool };
}

async function fetchLatestBackupAndJobStatus(
	appId: number | undefined | null,
	envId: number | undefined | null
) {
	if ( ! appId || ! envId ) {
		throw new Error( 'App ID and Env ID missing' );
	}

	return await retry(
		{
			retryOnlyIf: options => {
				return (
					( options.error.message || '' ).indexOf( 'Unexpected token < in JSON at position 0' ) !==
					-1
				);
			},
		},
		() => fetchLatestBackupAndJobStatusBase( appId, envId )
	);
}

/**
 * Generates a download link for a backup
 *
 * @param {number} appId    Application ID
 * @param {number} envId    Environment ID
 * @param {number} backupId Backup ID
 * @return {Promise} A promise which resolves to the download link
 */
async function generateDownloadLink(
	appId: number | null | undefined,
	envId: number | null | undefined,
	backupId: number | null | undefined
): Promise< string > {
	if ( ! appId || ! envId || ! backupId ) {
		throw new Error( 'generateDownloadLink: A parameter is missing' );
	}

	const api = API();
	const response = await api.mutate< GenerateDbBackupCopyUrlMutation >( {
		mutation: GENERATE_DOWNLOAD_LINK_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				backupId,
			},
		},
	} );

	return response.data?.generateDBBackupCopyUrl?.url ?? '';
}

/**
 * Creates an export job for a backup
 *
 * @param {number} appId    Application ID
 * @param {number} envId    Environment ID
 * @param {number} backupId Backup ID
 * @return {Promise} A promise which resolves to undefined if job creation succeeds
 * @throws {Error} Throws an error if the job creation fails
 */
async function createExportJob(
	appId: number | undefined | null,
	envId: number | undefined | null,
	backupId: number | undefined | null
): Promise< undefined > {
	if ( ! appId || ! envId || ! backupId ) {
		throw new Error( 'createExportJob: Some fields are undefined' );
	}

	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = API();
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

export interface ExportSQLOptions {
	outputFile?: string;
	confirmEnoughStorageHook?: ( archiveSize: number ) => Promise< PromptStatus >;
	generateBackup?: boolean;
	liveBackupCopyCLIOptions?: LiveBackupCopyCLIOptions;
	showMyDumperWarning?: boolean;
	skipDownload?: boolean;
}

/**
 * Class representing an export command workflow
 */
export class ExportSQLCommand {
	public progressTracker: ProgressTracker;
	public outputFile: string | null;
	public generateBackup: boolean;
	public confirmEnoughStorageHook: ExportSQLOptions[ 'confirmEnoughStorageHook' ];
	public steps = {
		PREPARE: 'prepare',
		CREATE: 'create',
		DOWNLOAD_LINK: 'downloadLink',
		CONFIRM_ENOUGH_STORAGE: 'confirmEnoughStorage',
		DOWNLOAD: 'download',
	};
	public track: TrackFunction;

	private readonly liveBackupCopyCLIOptions?: LiveBackupCopyCLIOptions;

	private readonly showMyDumperWarning: boolean;

	private readonly skipDownload: boolean;

	/**
	 * Creates an instance of SQLExportCommand
	 *
	 * @param {any}      app        The application object
	 * @param {any}      env        The environment object
	 * @param {object}   options 		The optional parameters
	 * @param {Function} trackerFn  The progress tracker function
	 */
	constructor(
		public app: App,
		public env: AppEnvironment,
		options: ExportSQLOptions = {},
		trackerFn: TrackFunction = () => {}
	) {
		this.outputFile =
			typeof options.outputFile === 'string' ? getAbsolutePath( options.outputFile ) : null;
		this.confirmEnoughStorageHook = options.confirmEnoughStorageHook;
		this.generateBackup = options.generateBackup || false;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.PREPARE, name: 'Preparing for backup download' },
			{ id: this.steps.CREATE, name: 'Creating backup copy' },
			{ id: this.steps.DOWNLOAD_LINK, name: 'Requesting download link' },
			{ id: this.steps.CONFIRM_ENOUGH_STORAGE, name: "Checking if there's enough storage" },
			{ id: this.steps.DOWNLOAD, name: 'Downloading file' },
		] );
		this.track = trackerFn;
		this.liveBackupCopyCLIOptions = options.liveBackupCopyCLIOptions;
		this.showMyDumperWarning =
			options.showMyDumperWarning === undefined ? true : options.showMyDumperWarning;
		this.skipDownload = options.skipDownload || false;
	}

	/**
	 * Fetches the export job of the latest backup
	 *
	 * @return {Promise} A promise which resolves to the export job
	 */
	public async getExportJob(): Promise< Job | undefined > {
		const { latestBackup, jobs } = await fetchLatestBackupAndJobStatus( this.app.id, this.env.id );

		if ( ! latestBackup ) {
			return undefined;
		}

		// Find the job that generates the export for the latest backup
		return jobs.find( job => {
			const metadata = ( job.metadata || [] ).find( md => md?.name === 'backupId' );
			return metadata && parseInt( metadata.value as string, 10 ) === latestBackup.id;
		} );
	}

	/**
	 * Fetches the S3 filename of the exported backup
	 *
	 * @return A promise which resolves to the filename
	 */
	public async getExportedFileName(): Promise< string > {
		const job = await this.getExportJob();
		if ( ! job ) {
			throw new Error( 'Job not found' );
		}

		const metadata = job.metadata?.find( md => md?.name === 'uploadPath' );
		return metadata?.value?.split( '/' )[ 1 ] as string;
	}

	/**
	 * Checks if the export job's preflight step is successful
	 *
	 * @param job The export job
	 * @return True if the preflight step is successful
	 */
	public isPrepared( job: Job | undefined ): boolean {
		const step = job?.progress?.steps?.find( st => st?.id === 'preflight' );
		return step?.status === 'success';
	}

	/**
	 * Checks if the export job's S3 upload step is successful
	 *
	 * @param job The export job
	 * @return True if the upload step is successful
	 */
	public isCreated( job: Job | undefined ) {
		const step = job?.progress?.steps?.find( st => st?.id === 'upload_backup' );
		return step?.status === 'success';
	}

	/**
	 * Stops the progress tracker
	 */
	public stopProgressTracker(): void {
		this.progressTracker.print();
		this.progressTracker.stopPrinting();
	}

	public async runBackupJob() {
		const cmd = new BackupDBCommand( this.app, this.env );

		let noticeMessage = `\n${ chalk.yellow( 'NOTICE: ' ) }`;
		noticeMessage +=
			'If a recent database backup does not exist, a new one will be generated for this environment. ';
		noticeMessage +=
			'Learn more about this: https://docs.wpvip.com/databases/backups/download-a-full-database-backup/ \n';
		console.log( noticeMessage );

		await cmd.run( false );
	}

	public async confirmEnoughStorage( archiveSize: number ): Promise< PromptStatus > {
		if ( this.confirmEnoughStorageHook ) {
			return await this.confirmEnoughStorageHook( archiveSize );
		}

		const storageAvailability = new BackupStorageAvailability();
		return await storageAvailability.validateAndPromptDiskSpaceWarningForBackupImport(
			archiveSize
		);
	}

	/**
	 * Sequentially runs the steps of the export workflow
	 *
	 */
	public async run() {
		if ( this.outputFile ) {
			try {
				fs.accessSync( path.parse( this.outputFile ).dir, fs.constants.W_OK );
			} catch ( err ) {
				const error = err as Error;
				await this.track( 'error', {
					error_type: 'cannot_write_to_path',
					error_message: `Cannot write to the specified path: ${ error?.message }`,
					stack: error?.stack,
				} );
				exit.withError( `Cannot write to the specified path: ${ error?.message }` );
			}
		}

		const filename = this.outputFile || 'exported.sql.gz';

		this.progressTracker.stepRunning( this.steps.PREPARE );
		this.progressTracker.startPrinting();

		let url: string;
		let size: number | undefined;

		if ( this.liveBackupCopyCLIOptions?.useLiveBackupCopy ) {
			const result = await this.generateLiveBackupCopy();

			url = result.url;
			size = Number( result.size );
		} else {
			url = await this.runBackup();

			const exportJob = await this.getExportJob();

			if ( ! exportJob ) {
				throw new Error( 'Export job not found' );
			}

			const bytesWrittenMeta = exportJob.metadata?.find( meta => meta?.name === 'bytesWritten' );
			if ( ! bytesWrittenMeta?.value ) {
				throw new Error( 'Export job metadata does not contain bytesWritten' );
			}

			size = Number( bytesWrittenMeta.value );
		}

		if ( this.skipDownload ) {
			this.progressTracker.stepSkipped( this.steps.CONFIRM_ENOUGH_STORAGE );
			this.progressTracker.stepSkipped( this.steps.DOWNLOAD );
			this.progressTracker.print();
			this.progressTracker.stopPrinting();

			return;
		}

		const storageConfirmed = await this.progressTracker.handleContinuePrompt(
			async setPromptShown => {
				const status = await this.confirmEnoughStorage( Number( size ) );
				if ( status.isPromptShown ) {
					setPromptShown();
				}

				return status.continue;
			}
		);

		if ( storageConfirmed ) {
			this.progressTracker.stepSuccess( this.steps.CONFIRM_ENOUGH_STORAGE );
		} else {
			this.progressTracker.stepFailed( this.steps.CONFIRM_ENOUGH_STORAGE );
			this.stopProgressTracker();
			exit.withError( 'Command canceled by user.' );
		}

		// The export file is prepared. Let's download it
		try {
			const onProgressCallback: OnProgressCallback = ( current, total ) => {
				if ( total ) {
					this.progressTracker.setProgress(
						`- ${ ( ( 100 * current ) / total ).toFixed( 2 ) }% (${ formatBytes(
							current
						) }/${ formatBytes( total ) })`
					);
				}
			};

			await downloadFile( url, filename, onProgressCallback );
			this.progressTracker.stepSuccess( this.steps.DOWNLOAD );
			this.stopProgressTracker();
			console.log( `File saved to ${ filename }` );
		} catch ( err ) {
			const error = err as Error;
			this.progressTracker.stepFailed( this.steps.DOWNLOAD );
			this.stopProgressTracker();
			await this.track( 'error', {
				error_type: 'download_failed',
				error_message: error.message,
				stack: error.stack,
			} );
			exit.withError( `Error downloading exported file: ${ error.message }` );
		}
	}

	private generateDownloadURLOutputString( url: string ): string {
		return `${ chalk.green( 'Download URL' ) }: ${ url }`;
	}

	private async runBackup() {
		if ( this.generateBackup ) {
			await this.runBackupJob();
		}

		const { latestBackup, envSqlDumpTool } = await fetchLatestBackupAndJobStatus(
			this.app.id,
			this.env.id
		);

		if ( ! latestBackup ) {
			await this.track( 'error', {
				error_type: 'no_backup_found',
				error_message: 'No backup found for the site',
			} );
			exit.withError( `No backup found for site ${ this.app.name }` );
		}

		const prepareAdditionalInfo = [];

		const showMyDumperWarning =
			this.showMyDumperWarning && ( latestBackup.sqlDumpTool ?? envSqlDumpTool ) === 'mydumper';
		if ( showMyDumperWarning ) {
			prepareAdditionalInfo.push(
				`${ chalk.yellow.bold(
					'WARNING:'
				) } This is a large or complex database. The backup file for this database is generated with MyDumper. The file can only be loaded with MyLoader. For more information: https://github.com/mydumper/mydumper`
			);
		}

		if ( await this.getExportJob() ) {
			prepareAdditionalInfo.push(
				`Attaching to an existing export for the backup with timestamp ${ latestBackup.createdAt }`
			);
		} else {
			prepareAdditionalInfo.push(
				`Exporting database backup with timestamp ${ latestBackup.createdAt }`
			);

			try {
				await createExportJob( this.app.id, this.env.id, latestBackup.id );
			} catch ( err ) {
				const error = err as Error;
				// Todo: match error code instead of message substring
				if ( error.message.includes( 'Backup Copy already in progress' ) ) {
					await this.track( 'error', {
						error_type: 'job_already_running',
						error_message: error.message,
						stack: error.stack,
					} );
					exit.withError(
						'There is an export job already running for this environment: ' +
							`https://dashboard.wpvip.com/apps/${ this.app.id }/${ this.env.uniqueLabel }/database/backups\n` +
							'Currently, we allow only one export job at a time, per site. Please try again later.'
					);
				} else {
					await this.track( 'error', {
						error_type: 'create_export_job',
						error_message: error.message,
						stack: error.stack,
					} );
				}
				exit.withError( `Error creating export job: ${ error.message }` );
			}
		}

		await pollUntil(
			this.getExportJob.bind( this ),
			EXPORT_SQL_PROGRESS_POLL_INTERVAL,
			this.isPrepared.bind( this )
		);

		this.progressTracker.stepSuccess( this.steps.PREPARE, prepareAdditionalInfo );

		await pollUntil(
			this.getExportJob.bind( this ),
			EXPORT_SQL_PROGRESS_POLL_INTERVAL,
			this.isCreated.bind( this )
		);
		this.progressTracker.stepSuccess( this.steps.CREATE );

		const url = await generateDownloadLink( this.app.id, this.env.id, latestBackup.id );
		this.progressTracker.stepSuccess( this.steps.DOWNLOAD_LINK, [
			this.generateDownloadURLOutputString( url ),
		] );

		return url;
	}

	private async generateLiveBackupCopy() {
		if ( ! this.liveBackupCopyCLIOptions ) {
			throw new UserError( 'Configuration file is required for live backup copy.' );
		}

		if ( ! this.app.id || ! this.env.id ) {
			throw new UserError( 'App ID and Environment ID are required to start live backup copy.' );
		}

		const config = this.getLiveBackupConfigFromCLIOptions();

		try {
			const copyId = await liveBackupCopy.startLiveBackupCopy( {
				appId: this.app.id,
				environmentId: this.env.id,
				config,
			} );
			this.progressTracker.stepSuccess( this.steps.PREPARE );

			this.progressTracker.stepRunning( this.steps.CREATE );

			const result = await liveBackupCopy.getDownloadURL( {
				appId: this.app.id,
				environmentId: this.env.id,
				copyId,
			} );
			this.progressTracker.stepSuccess( this.steps.CREATE );

			this.progressTracker.stepSuccess( this.steps.DOWNLOAD_LINK, [
				this.generateDownloadURLOutputString( result.url ),
			] );

			return result;
		} catch ( err ) {
			const message = parseApiError( err ) ?? 'Unknown error';

			await this.track( 'error', {
				error_type: 'live_backup_copy',
				error_message: message,
				stack: err instanceof Error ? err.stack : undefined,
			} );

			exit.withError( `Error creating live backup copy: ${ message }` );
		}
	}

	private getLiveBackupConfigFromCLIOptions() {
		if ( this.liveBackupCopyCLIOptions?.configFile ) {
			return this.loadLiveBackupCopyConfig( this.liveBackupCopyCLIOptions?.configFile );
		}

		let type = BackupLiveCopyType.TABLES;
		let tables: DBLiveCopyConfig[ 'tables' ];
		let siteIds: DBLiveCopyConfig[ 'site_ids' ];
		if ( this.liveBackupCopyCLIOptions?.tables ) {
			tables = Object.fromEntries(
				this.liveBackupCopyCLIOptions?.tables.map( key => [ key, {} ] )
			);
		}

		if ( this.liveBackupCopyCLIOptions?.siteIds ) {
			type = BackupLiveCopyType.SITE_IDS;
			siteIds = this.liveBackupCopyCLIOptions?.siteIds.map( id => Number( id ) );
		}

		if ( this.liveBackupCopyCLIOptions?.wpcliCommand ) {
			type = BackupLiveCopyType.WP_CLI_COMMAND;
		}

		return {
			type,
			tables,
			site_ids: siteIds,
			wpcli_command: this.liveBackupCopyCLIOptions?.wpcliCommand,
		};
	}

	private loadLiveBackupCopyConfig( configFile: string ): DBLiveCopyConfig {
		// Read the file exactly once and derive existence, size, and contents from
		// that single read to avoid a time-of-check/time-of-use race condition.
		let fileContents: string;
		try {
			fileContents = fs.readFileSync( configFile, 'utf-8' );
		} catch ( err ) {
			if ( ( err as NodeJS.ErrnoException )?.code === 'ENOENT' ) {
				throw new UserError( `Configuration file not found: ${ configFile }` );
			}

			const errMessage = err instanceof Error ? err.message : 'Unknown error';
			throw new UserError( `Error reading configuration file: ${ configFile } - ${ errMessage }` );
		}

		const size = Buffer.byteLength( fileContents, 'utf-8' );
		if ( size > MAX_LIVE_BACKUP_CONFIG_SIZE_BYTES ) {
			throw new UserError(
				`Configuration file is too large (${ formatBytes(
					size
				) }); the maximum allowed size is ${ formatBytes(
					MAX_LIVE_BACKUP_CONFIG_SIZE_BYTES
				) }. For large or complex exports, use the \`--wpcli-command\` option instead.`
			);
		}

		try {
			return JSON.parse( fileContents ) as DBLiveCopyConfig;
		} catch ( err ) {
			const errMessage = err instanceof Error ? err.message : 'Unknown error';
			if ( err instanceof SyntaxError ) {
				throw new UserError(
					`Invalid JSON in configuration file: ${ configFile } - ${ errMessage }`
				);
			}

			throw new UserError( `Error reading configuration file: ${ configFile } - ${ errMessage }` );
		}
	}
}
