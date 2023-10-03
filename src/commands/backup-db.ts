/**
 * External dependencies
 */

import chalk from 'chalk';
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import * as exit from '../lib/cli/exit';
import { pollUntil } from '../lib/utils';
import { ProgressTracker } from '../lib/cli/progress';
import { CommandTracker } from '../lib/tracker';
import { GraphQLFormattedError } from 'graphql';
import { RateLimitExceededError } from '../lib/types/graphql/rate-limit-exceeded-error';
import { AppBackupJobStatusQuery } from './backup-db.generated';
import { App, AppEnvironment, Job } from '../graphqlTypes';
import { formatDuration } from '../lib/cli/format';

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

async function getBackupJob( appId: number, envId: number ) {
	const api = await API();

	const response = await api.query< AppBackupJobStatusQuery >( {
		query: DB_BACKUP_JOB_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const {
		data: { app },
	} = response;

	return app?.environments?.[ 0 ]?.jobs?.[ 0 ] as Job | undefined;
}

async function createBackupJob( appId: number, envId: number ) {
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
	app: App;
	env: AppEnvironment;
	job?: Job;
	jobStatus?: string;
	jobAge?: number;
	backupName?: string;
	silent?: boolean;
	steps = {
		PREPARE: 'prepare',
		GENERATE: 'generate',
	};
	track: CommandTracker;
	private progressTracker: ProgressTracker;

	constructor( app: App, env: AppEnvironment, trackerFn: CommandTracker = async () => {} ) {
		this.app = app;
		this.env = env;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.PREPARE, name: 'Preparing for backup generation' },
			{ id: this.steps.GENERATE, name: 'Generating backup' },
		] );
		this.track = trackerFn;
	}

	log( msg: string ) {
		if ( this.silent ) {
			return;
		}
		console.log( msg );
	}

	isDone( job?: Job ) {
		return ! job?.inProgressLock;
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
		this.job = await getBackupJob( this.app.id ?? 0, this.env.id ?? 0 );
		this.backupName =
			this.job?.metadata?.find( meta => meta?.name === 'backupName' )?.value ?? 'Unknown';
		this.jobStatus = this.job?.progress?.status ?? undefined;

		if ( this.job?.completedAt ) {
			this.jobAge =
				( new Date().getTime() - new Date( this.job.completedAt ).getTime() ) / 1000 / 60;
		} else {
			this.jobAge = undefined;
		}

		return this.job;
	}

	async run( silent = false ) {
		this.silent = silent;

		await this.loadBackupJob();

		if ( this.job?.inProgressLock ) {
			this.log( 'Database backup already in progress...' );
		} else {
			try {
				this.log( 'Generating a new database backup...' );
				this.progressTracker.stepRunning( this.steps.PREPARE );
				this.progressTracker.startPrinting();
				await createBackupJob( this.app.id ?? 0, this.env.id ?? 0 );
			} catch ( err ) {
				const error = err as Error & {
					graphQLErrors?: GraphQLFormattedError[];
				};
				const graphQLError = error.graphQLErrors?.[ 0 ] as RateLimitExceededError | undefined;
				this.progressTracker.stepFailed( this.steps.PREPARE );
				this.stopProgressTracker();
				if ( graphQLError?.extensions?.errorHttpCode === 429 ) {
					const retryAfter = graphQLError.extensions.retryAfter;
					await this.track( 'error', {
						error_type: 'rate_limit_exceeded',
						error_message: `Couldn't create a new database backup job: ${ error.message }`,
						stack: error.stack,
					} );
					const errMessage = `A new database backup was not generated because a recently generated backup already exists.
If you would like to run the same command, you can retry in ${ formatDuration(
						new Date(),
						new Date( retryAfter )
					) }
Alternatively, you can export the latest existing database backup by running: ${ chalk.green(
						'vip @app.env export sql'
					) }, right away.
Learn more about limitations around generating database backups: https://docs.wpvip.com/technical-references/vip-dashboard/backups/#0-limitations
					`;
					exit.withError( errMessage );
				}
				await this.track( 'error', {
					error_type: 'db_backup_job_creation_failed',
					error_message: `Database Backup job creation failed: ${ error.message }`,
					stack: error.stack,
				} );
				exit.withError( `Couldn't create a new database backup job: ${ error.message }` );
			}
		}

		this.progressTracker.stepSuccess( this.steps.PREPARE );

		this.progressTracker.stepRunning( this.steps.GENERATE );

		try {
			await pollUntil(
				this.loadBackupJob.bind( this ),
				DB_BACKUP_PROGRESS_POLL_INTERVAL,
				this.isDone.bind( this )
			);
		} catch ( err ) {
			const error = err as Error;
			this.progressTracker.stepFailed( this.steps.GENERATE );
			this.stopProgressTracker();
			await this.track( 'error', {
				error_type: 'db_backup_job_failed',
				error_message: `Database Backup job failed: ${ error.message }`,
				stack: error.stack,
			} );
			exit.withError( `Failed to create new database backup: ${ error.message }` );
		}

		this.progressTracker.stepSuccess( this.steps.GENERATE );
		this.stopProgressTracker();

		await this.loadBackupJob();

		if ( this.jobStatus !== 'success' ) {
			exit.withError( 'Failed to create a new database backup' );
		} else {
			this.log( 'New database backup created' );
		}
	}
}
