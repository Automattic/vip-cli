/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

import chalk from 'chalk';
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API, { disableGlobalGraphQLErrorHandling, enableGlobalGraphQLErrorHandling } from '../lib/api';
import * as exit from '../lib/cli/exit';
import { pollUntil } from '../lib/utils';
import { ProgressTracker } from '../lib/cli/progress';

const DB_BACKUP_PROGRESS_POLL_INTERVAL = 1000;

export const CREATE_DB_BACKUP_JOB_MUTATION = gql`
	mutation TriggerDatabaseBackup($input: AppEnvironmentTriggerDBBackupInput) {
		triggerDatabaseBackup(input: $input) {
			success
		}
	}
`;

export const DB_BACKUP_JOB_STATUS_QUERY = gql`
	query AppBackupJobStatus($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			id
			environments(id: $envId) {
				id
				jobs(jobTypes: [db_backup]) {
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
					}
				}
			}
		}
	}
`;

async function getBackupJob( appId, envId ) {
	const api = await API();

	const response = await api.query( {
		query: DB_BACKUP_JOB_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const {
		data: {
			app: { environments },
		},
	} = response;

	const job = environments[ 0 ].jobs[ 0 ];

	return job || null;
}

async function createBackupJob( appId, envId ) {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();
	await api.mutate( {
		mutation: CREATE_DB_BACKUP_JOB_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();
}

// Library for a possible command in the future: vip backup db @app.env
export class BackupDBCommand {
	app;
	env;
	job;
	jobStatus;
	jobAge;
	backupName;
	silent;
	steps = {
		PREPARE: 'prepare',
		GENERATE: 'generate',
	};
	track;

	constructor( app, env, trackerFn = () => {} ) {
		this.app = app;
		this.env = env;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.PREPARE, name: 'Preparing' },
			{ id: this.steps.GENERATE, name: 'Generating backup' },
		] );
		this.track = trackerFn;
	}

	log( msg ) {
		if ( this.silent ) return;
		console.log( msg );
	}

	isDone( job ) {
		return ! job.inProgressLock;
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

	async loadBackupJob() {
		this.job = await getBackupJob( this.app.id, this.env.id );
		this.backupName = this.job?.metadata.find( meta => meta.name === 'backupName' )?.value || 'Unknown';
		this.jobStatus = this.job?.progress?.status;

		if ( this.job?.completedAt ) {
			this.jobAge = ( new Date() - new Date( this.job.completedAt ) ) / 1000 / 60;
		} else {
			this.jobAge = undefined;
		}

		return this.job;
	}

	async run( silent = false ) {
		this.silent = silent;

		await this.loadBackupJob();

		this.progressTracker.stepRunning( this.steps.PREPARE );
		this.progressTracker.startPrinting();

		if ( this.job?.inProgressLock ) {
			this.log( 'Attaching to an already running database backup job...' );
		}	else {
			try {
				await createBackupJob( this.app.id, this.env.id );
			} catch ( err ) {
				this.progressTracker.stepFailed( this.steps.PREPARE );
				this.stopProgressTracker();
				if ( err.message?.includes( 'Database backups limit reached' ) ) {
					await this.track( 'error', {
						error_type: 'rate_limit_exceeded',
						error_message: `Couldn't create a new database backup job: ${ err?.message }`,
						stack: err?.stack,
					} );
					let errMessage = err.message.replace( 'Database backups limit reached', 
						'New database backup generation failed because there was already one created recently, either by our automated system or by a user on your site' );
					errMessage = errMessage.replace( 'Retry after', '\nTo create a new backup, you can wait until:' );
					errMessage += `\nYou can also export the latest backup using the ${ chalk.yellow( 'vip @app.env export sql' ) } command`;
					errMessage += '\n\nRead more about database backups & exports here: https://docs.wpvip.com/technical-references/vip-dashboard/backups/ \n';
					exit.withError( errMessage );
				}
				await this.track( 'error', {
					error_type: 'db_backup_job_creation_failed',
					error_message: `Database Backup job creation failed: ${ err?.message }`,
					stack: err?.stack,
				} );
				exit.withError( `Couldn't create a new database backup job: ${ err?.message }` );
			}
		}

		this.progressTracker.stepSuccess( this.steps.PREPARE );

		this.progressTracker.stepRunning( this.steps.GENERATE );

		try {
			await pollUntil( this.loadBackupJob.bind( this ), DB_BACKUP_PROGRESS_POLL_INTERVAL, this.isDone.bind( this ) );
		} catch ( err ) {
			this.progressTracker.stepFailed( this.steps.GENERATE );
			this.stopProgressTracker();
			await this.track( 'error', {
				error_type: 'db_backup_job_failed',
				error_message: `Database Backup job failed: ${ err?.message }`,
				stack: err?.stack,
			} );
			exit.withError( `Failed to create new database backup: ${ err?.message }` );
		}

		this.progressTracker.stepSuccess( this.steps.GENERATE );
		this.stopProgressTracker();

		await this.loadBackupJob();

		if ( this.jobStatus !== 'success' ) {
			exit.withError( 'Failed to create a new database backup' );
		} else {
			this.log( `New database backup created at ${ this.backupName }` );
		}
	}
}
