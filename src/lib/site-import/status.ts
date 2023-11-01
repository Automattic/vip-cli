/* eslint-disable complexity */
import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import chalk from 'chalk';
import debugLib from 'debug';
import gql from 'graphql-tag';

import { AppForImport, currentUserCanImportForApp } from './db-file-import';
import { AppQuery, AppQueryVariables } from './status.generated';
import {
	App,
	AppEnvironment,
	AppEnvironmentImportStatus,
	AppEnvironmentStatusProgressStep,
	Job,
	Maybe,
	PrimaryDomainSwitchJob,
} from '../../graphqlTypes';
import API from '../../lib/api';
import * as exit from '../../lib/cli/exit';
import { capitalize, formatEnvironment, getGlyphForStatus } from '../../lib/cli/format';
import { ProgressTracker, StepFromServer, StepStatus } from '../../lib/cli/progress';

const debug = debugLib( 'vip:lib/site-import/status' );

const IMPORT_SQL_PROGRESS_POLL_INTERVAL = 5000;

const IMPORT_SQL_PROGRESS_QUERY = gql`
	query App($appId: Int, $envId: Int) {
		app(id: $appId) {
			environments(id: $envId) {
				id
				isK8sResident
				launched
				jobs(types: "sql_import") {
					id
					type
					completedAt
					createdAt
					progress {
						status
						steps {
							id
							name
							status
						}
					}
				}
				importStatus {
					dbOperationInProgress
					importInProgress
					progress {
						started_at
						steps {
							name
							started_at
							finished_at
							result
							output
						}
						finished_at
					}
				}
			}
		}
	}
`;

export interface ImportSqlCheckStatusInput {
	app: App | AppForImport;
	env: AppEnvironment;
	progressTracker: ProgressTracker;
}

interface GetStatusResponse {
	importStatus?: AppEnvironmentImportStatus | null;
	importJob?: Job | PrimaryDomainSwitchJob | null;
	launched?: boolean | null;
}

async function getStatus(
	api: ApolloClient< NormalizedCacheObject >,
	appId: number,
	envId: number
): Promise< GetStatusResponse > {
	const response = await api.query< AppQuery, AppQueryVariables >( {
		query: IMPORT_SQL_PROGRESS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );
	const environments = response.data.app?.environments ?? [];
	if ( ! environments.length ) {
		throw new Error( 'Unable to determine import status from environment' );
	}
	const environment = environments[ 0 ] ?? {};
	const { importStatus, jobs, launched } = environment;

	if ( ! environment.isK8sResident && ! jobs?.length ) {
		return {};
	}

	const [ importJob ] = jobs ?? [];

	return {
		importStatus,
		importJob,
		launched,
	};
}

interface ImportFailedError {
	inImportProgress: boolean;
	commandOutput: string[] | null;
	error: string;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	stepName: 'import_preflights' | 'importing_db' | 'validating_db' | string; // NOSONAR
	launched: boolean;
}

function getErrorMessage( importFailed: ImportFailedError, launched = false ): string {
	debug( { importFailed } );

	const rollbackMessage = launched
		? ''
		: `Your site is ${ chalk.blue(
				'automatically being rolled back'
		  ) } to the last backup prior to your import job.
`;

	let message = importFailed.error;

	if ( importFailed.inImportProgress ) {
		switch ( importFailed.stepName ) {
			case 'import_preflights':
				message += `
This error occurred prior to the mysql batch script processing of your SQL file.

Your site content was not altered.

If this error persists, please contact support.
`;
				break;

			case 'importing_db':
				message += `
This error occurred during the mysql batch script processing of your SQL file.

${ rollbackMessage }`;
				if ( importFailed.commandOutput ) {
					const commandOutput = ( [] as string[] ).concat( importFailed.commandOutput ).join( ';' );
					message += `
Please inspect your input file and make the appropriate corrections before trying again.
The server said:
> ${ chalk.red( commandOutput ) }
`;
				} else {
					message += 'Please contact support and include this message along with your sql file.';
				}
				break;

			case 'validating_db':
				message += `\nThis error occurred during the post-import validation of the imported data.

${ rollbackMessage }
`;
				if ( importFailed.commandOutput ) {
					const commandOutput = ( [] as string[] ).concat( importFailed.commandOutput ).join( ';' );
					message += `
Please inspect your input file and make the appropriate corrections before trying again.
The server said:
> ${ chalk.red( commandOutput ) }
`;
				} else {
					message += 'Please contact support and include this message along with your sql file.';
				}

				break;
			default:
		}
	}
	return message;
}

export async function importSqlCheckStatus( {
	app,
	env,
	progressTracker,
}: ImportSqlCheckStatusInput ) {
	// Stop printing so we can pass our callback
	progressTracker.stopPrinting();

	// NO `console.log` in this function (until results are final)! It will break the progress printing.
	const api = await API();

	if ( ! currentUserCanImportForApp( app ) ) {
		throw new Error(
			'The currently authenticated account does not have permission to view SQL import status.'
		);
	}
	let createdAt: Maybe< string > | undefined;
	let completedAt: Maybe< string > | undefined;
	let overallStatus: string | StepStatus = 'Checking...';

	const setProgressTrackerSuffix = () => {
		const sprite = getGlyphForStatus( overallStatus, progressTracker.runningSprite );
		const formattedCreatedAt = createdAt
			? `${ new Date( createdAt ).toLocaleString() } (${ createdAt })`
			: 'TBD';
		const formattedCompletedAt =
			createdAt && completedAt
				? `${ new Date( completedAt ).toLocaleString() } (${ completedAt })`
				: 'TBD';
		const exitPrompt = '(Press ^C to hide progress. The import will continue in the background.)';

		let statusMessage;
		switch ( overallStatus ) {
			case 'success':
				statusMessage = `Success ${ sprite } imported data should be visible on your site ${
					env.primaryDomain?.name ?? 'N/A'
				}.`;
				break;
			case 'running':
				if ( progressTracker.allStepsSucceeded() ) {
					statusMessage = `Finishing up... ${ sprite } `;
					break;
				}
			// Intentionally no break to get default case:
			// eslint-disable-next-line no-fallthrough
			default:
				statusMessage = `${ capitalize( overallStatus ) } ${ sprite }`;
		}

		const maybeExitPrompt = `${ overallStatus === 'running' ? exitPrompt : '' }`;
		const jobCreateCompleteTimestamps = `
SQL Import Started: ${ formattedCreatedAt }
SQL Import Completed: ${ formattedCompletedAt }`;
		const maybeTimestamps = [ 'running', 'success', 'failed' ].includes( overallStatus )
			? jobCreateCompleteTimestamps
			: '';
		const suffix = `
=============================================================
Status: ${ statusMessage }
Site: ${ app.name ?? 'N/A' } (${ formatEnvironment( env.type ?? 'N/A' ) })${ maybeTimestamps }
=============================================================
${ maybeExitPrompt }
`;
		progressTracker.suffix = suffix;
	};

	const setSuffixAndPrint = () => {
		setProgressTrackerSuffix();
		progressTracker.print();
	};

	progressTracker.startPrinting( setSuffixAndPrint );

	const getResults = (): Promise< string | Job | PrimaryDomainSwitchJob > =>
		new Promise( ( resolve, reject ) => {
			const checkStatus = async (): Promise< unknown > => {
				let status;
				try {
					status = await getStatus( api, app.id ?? -1, env.id ?? -1 );
				} catch ( error ) {
					return reject( { error } );
				}
				const { importStatus, launched } = status;
				let { importJob } = status;

				let jobStatus;
				let jobSteps = [];
				if ( env.isK8sResident ) {
					// in the future the API may provide this in k8s jobs so account for that.
					// Until then we need to create the importJob from the status object.
					if ( ! importJob ) {
						importJob = {};
						const statusSteps = importStatus?.progress?.steps as
							| AppEnvironmentStatusProgressStep[]
							| undefined;

						// if the progress meta isn't filled out yet, wait until it is.
						if ( ! statusSteps ) {
							return setTimeout( () => {
								void checkStatus();
							}, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
						}

						jobSteps = statusSteps.map( step => {
							return {
								id: step.name,
								name: capitalize( step.name?.replace( /_/g, ' ' ) ),
								status: step.result,
							};
						} );

						if (
							statusSteps.some( ( { result } ) => result === 'failed' ) &&
							! statusSteps.find( ( { name, result } ) => name === 'restore_db' && ! result )
						) {
							jobStatus = 'error';
						} else if ( statusSteps.every( ( { result } ) => result === 'success' ) ) {
							jobStatus = 'success';
							const timestamps = statusSteps
								.map( step => step.finished_at )
								.filter( Boolean ) as number[];
							importJob.completedAt = new Date( Math.max( ...timestamps, 0 ) * 1000 ).toUTCString();
						}

						if ( importStatus?.progress?.started_at ) {
							importJob.createdAt = new Date(
								importStatus.progress.started_at * 1000
							).toUTCString();
						}

						importJob.progress = { status: jobStatus, steps: jobSteps };
					}
				} else if ( ! importJob ) {
					return resolve( 'No import job found' );
				}

				jobStatus = importJob.progress?.status ?? 'unknown';
				jobSteps = importJob.progress?.steps ?? [];
				createdAt = importJob.createdAt;
				completedAt = importJob.completedAt;

				const {
					dbOperationInProgress,
					importInProgress,
					progress: importStepProgress,
				} = importStatus ?? {};

				debug( {
					jobStatus,
					completedAt,
					createdAt,
					dbOperationInProgress,
					importInProgress,
					importStepProgress,
				} );

				let jobCreationTime;
				try {
					jobCreationTime = new Date( createdAt ?? '' ).getTime();
				} catch ( err ) {
					debug( 'Unable to parse createdAt to a Date' );
				}

				let failedImportStep;

				if (
					jobCreationTime &&
					( importStepProgress?.started_at ?? 0 ) * 1000 >= jobCreationTime
				) {
					// The contents of the `import_progress` meta are pertinent to the most recent import job
					failedImportStep = importStepProgress?.steps?.find(
						step =>
							step?.result === 'failed' &&
							1000 * ( step.started_at ?? 0 ) > new Date( createdAt ?? '' ).getTime()
					);
				}

				if ( ! jobSteps.length ) {
					return reject( { error: 'Could not enumerate the import job steps', launched } );
				}

				if ( failedImportStep ) {
					// The server marks the step as a success as per the host action, demote it to 'failed'
					const _jobSteps = [ ...jobSteps ];
					const failedJobStepIndex = _jobSteps.findIndex( step => step?.id === 'import' );
					_jobSteps[ failedJobStepIndex ] = {
						..._jobSteps[ failedJobStepIndex ],
						status: 'failed',
					};
					progressTracker.setStepsFromServer( _jobSteps as unknown as StepFromServer[] );
					overallStatus = 'failed';
					setSuffixAndPrint();

					return reject( {
						inImportProgress: true,
						commandOutput: failedImportStep.output,
						error: 'Import step failed',
						stepName: failedImportStep.name,
						launched,
					} as ImportFailedError );
				}

				progressTracker.setStepsFromServer( jobSteps as unknown as StepFromServer[] );

				setSuffixAndPrint();

				if ( jobStatus === 'error' ) {
					return reject( { error: 'Import job failed', steps: jobSteps, launched } );
				}

				if ( jobStatus !== 'running' && completedAt ) {
					return resolve( importJob );
				}

				overallStatus = 'running';

				setTimeout( () => {
					void checkStatus();
				}, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
			};

			// Kick off the check
			void checkStatus();
		} );

	try {
		const results = await getResults();
		if ( typeof results === 'string' ) {
			overallStatus = results;
		} else {
			overallStatus = results.progress?.status ?? 'unknown';
			// This shouldn't be 'unknown'...what should we do here?
		}

		progressTracker.stopPrinting();

		setProgressTrackerSuffix();

		// Print one final time
		progressTracker.print( { clearAfter: true } );

		// This type of result is not an importing error. e.g. no import job was found
		process.exit( 0 );
	} catch ( importFailed ) {
		progressTracker.stopPrinting();
		progressTracker.print( { clearAfter: true } );
		exit.withError(
			getErrorMessage(
				importFailed as ImportFailedError,
				( importFailed as ImportFailedError ).launched
			)
		);
	}
}

export default {
	importSqlCheckStatus,
};
