/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { currentUserCanImportForApp } from 'lib/site-import/db-file-import';
import { ProgressTracker } from 'lib/cli/progress';
import { getGlyphForStatus } from 'lib/cli/format';

const debug = debugLib( 'vip:lib/site-import/status' );

const IMPORT_SQL_PROGRESS_POLL_INTERVAL = 5000;
const PRINT_STATUS_INTERVAL = 100;

const IMPORT_SQL_PROGRESS_QUERY = gql`
	query App($id: Int) {
		app(id: $id) {
			environments {
				id
				jobs {
					id
					type
					createdAt
					progress {
						status
						steps {
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

export type ImportSqlCheckStatusInput = {
	app: Object,
	env: Object,
	progressTracker: ProgressTracker,
};

async function getStatus( api, appId, envId ) {
	const response = await api.query( {
		query: IMPORT_SQL_PROGRESS_QUERY,
		variables: { id: appId },
		fetchPolicy: 'network-only',
	} );
	const {
		data: {
			app: { environments },
		},
	} = response;
	const { importStatus, jobs } = environments.find( e => e.id === envId );
	const importJob = jobs.find( ( { type } ) => type === 'sql_import' );
	return {
		importStatus,
		importJob,
	};
}

function getErrorMessage( importFailed ) {
	debug( { importFailed } );

	let message = chalk.red( `Error: ${ importFailed.error }` );

	if ( importFailed.inImportProgress ) {
		switch ( importFailed.stepName ) {
			case 'import_preflights':
			case 'validating_sql':
				message += `
This error occurred prior to the mysql batch script processing of your SQL file.

Your site content was not altered.

Please inspect your input file and make the appropriate corrections before trying again.
`;
				break;
			case 'importing_db':
				message += `
This error occurred during the mysql batch script processing of your SQL file.

Your site is ${ chalk.blue(
		'automatically being rolled back'
	) } to the last backup prior to your import job.
`;
				if ( importFailed.commandOutput ) {
					const commandOutput = [].concat( importFailed.commandOutput ).join( ';' );
					message += `
Please inspect your input file and make the appropriate corrections before trying again.
The database server said:
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
	let createdAt;
	let overallStatus = 'running';

	const setProgressTrackerSuffix = () => {
		progressTracker.suffix = '\n\n';
		if ( createdAt ) {
			progressTracker.suffix += `SQL Import Job Started at ${ createdAt } / ${ new Date(
				createdAt
			) }`;
		}
		progressTracker.suffix += `
=============================================================
Status: ${ overallStatus } ${ getGlyphForStatus(
	overallStatus,
	progressTracker.runningSprite
) }\n`;
	};

	const setSuffixAndPrint = () => {
		setProgressTrackerSuffix();
		progressTracker.print();
	};

	progressTracker.startPrinting( setSuffixAndPrint );

	const getResults = () =>
		new Promise( ( resolve, reject ) => {
			const checkStatus = async () => {
				const { importStatus, importJob } = await getStatus( api, app.id, env.id );

				debug( { importJob } );

				if ( ! importJob ) {
					return resolve( 'No import job found' );
				}

				const {
					progress: { status: jobStatus, steps },
				} = importJob;

				createdAt = importJob.createdAt;
				// completedAt, TODO when Parker support is present

				const {
					dbOperationInProgress,
					importInProgress,
					progress: importStepProgress,
				} = importStatus;

				debug( { createdAt, dbOperationInProgress, importInProgress, importStepProgress } );

				let jobCreationTime;
				try {
					jobCreationTime = new Date( createdAt ).getTime();
				} catch ( e ) {
					debug( 'Unable to parse createdAt to a Date' );
				}

				if ( jobCreationTime && importStepProgress?.started_at * 1000 > jobCreationTime ) {
					// The contents of the `import_progress` meta are pertinent to the most recent import job
					const failedImportStep = importStepProgress.steps.find(
						step =>
							step?.result === 'failed' && 1000 * step?.started_at > new Date( createdAt ).getTime()
					);

					if ( failedImportStep ) {
						return reject( {
							inImportProgress: true,
							commandOutput: failedImportStep.output,
							error: 'Import step failed',
							stepName: failedImportStep.name,
							errorText: failedImportStep.error,
						} );
					}
				}

				if ( jobStatus === 'error' ) {
					return reject( { error: 'Import job failed', steps } );
				}

				if ( ! steps.length ) {
					return reject( { error: 'Could not enumerate the import job steps' } );
				}

				progressTracker.setStepsFromServer( steps );

				if ( jobStatus !== 'running' ) {
					return resolve( importJob );
				}

				setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
			};

			// Kick off the check
			checkStatus();
		} );

	try {
		const results = await getResults();

		if ( typeof results === 'string' ) {
			overallStatus = results;
		} else {
			overallStatus = results?.progress?.status || 'unknown';
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
		progressTracker.suffix += `\nERROR: ${ chalk.red( getErrorMessage( importFailed ) ) }\n`;
		progressTracker.print( { clearAfter: true } );
		process.exit( 1 );
	}
}

export default {
	importSqlCheckStatus,
};
