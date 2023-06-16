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

const BACKUP_PROGRESS_POLL_INTERVAL = 1000;

export const CREATE_BACKUP_JOB_MUTATION = gql`
	mutation TriggerDatabaseBackup($input: AppEnvironmentTriggerDBBackupInput) {
		triggerDatabaseBackup(input: $input) {
			success
		}
	}
`;

export const BACKUP_JOB_STATUS_QUERY = gql`
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
		query: BACKUP_JOB_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const {
		data: {
			app: { environments },
		},
	} = response;

	const job = environments[0].jobs[0];

	return job || null;
}

async function createBackupJob( appId, envId ) {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();
	await api.mutate( {
		mutation: CREATE_BACKUP_JOB_MUTATION,
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
	track;

	constructor( app, env, trackerFn = () => {} ) {
		this.app = app;
		this.env = env;
		this.track = trackerFn;
	}

	log( msg ) {
		if ( this.silent ) return;
		console.log( msg );
	}

	isDone( job ) {
		return !job.inProgressLock;
	}

	async loadBackupJob() {
		this.job = await getBackupJob( this.app.id, this.env.id );
		this.backupName = this.job?.metadata.find( meta => meta.name === 'backupName' )?.value || 'Unknown';
		this.jobStatus = this.job?.progress?.status;

		if ( this.job?.completedAt ) {
			this.jobAge = ( new Date() - new Date( this.job.completedAt )) / 1000 / 60;
		} else {
			this.jobAge = undefined;
		}

		return this.job;
	}

	async run( silent = false ) {
		this.silent = silent;

		await this.loadBackupJob();

		if ( this.job?.inProgressLock ) {
			this.log( 'Attaching to an already running backup job...' );
		} else if ( this.jobAge < 15 ) {
			this.log( chalk.yellow( `This environment's most recent backup is ${ Math.ceil( this.jobAge ) } minutes old.` ) );
			this.log( chalk.yellow( `You cannot have more than one backup in 15 minutes span. Please use the existing backup:\n  ${ this.backupName }` ) );
			return;
		} else {
			try {
				this.log( 'Creating a new backup job...' );
				await createBackupJob( this.app.id, this.env.id );
			} catch ( err ) {
				console.log( err );
				await this.track( 'error', {
					error_type: 'failed_to_trigger_backup',
					error_message: `Couldn't create a new backup job: ${ err?.message }`,
					stack: err?.stack,
				} );
				exit.withError( `Couldn't create a new backup job: ${ err?.message }` );
			}
		}

		this.log( 'Waiting for the backup job to finish...' );

		try {
			await pollUntil( this.loadBackupJob.bind( this ), BACKUP_PROGRESS_POLL_INTERVAL, this.isDone.bind( this ) );
		} catch ( err ) {
			await this.track( 'error', {
				error_type: 'backup_job_failed',
				error_message: `Backup job failed: ${ err?.message }`,
				stack: err?.stack,
			} );
			exit.withError( `Backup job failed: ${err?.message}` );
		}

		await this.loadBackupJob();

		if ( this.jobStatus !== 'success' ) {
			exit.withError( 'Failed to generate a backup. Please try again later or contact support.' );
		} else {
			this.log( `New backup is created: ${ this.backupName }` );
		}
	}
}
