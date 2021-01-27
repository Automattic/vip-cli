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
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { formatJobSteps, RunningSprite } from 'lib/cli/format';
import { currentUserCanImportForApp } from 'lib/site-import/db-file-import';

const debug = debugLib( 'vip:lib/site-import/status' );

const IMPORT_SQL_PROGRESS_POLL_INTERVAL = 5000;

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

export async function importSqlCheckStatus( { app, env }: ImportSqlCheckStatusInput ) {
	const api = await API();

	if ( ! currentUserCanImportForApp( app ) ) {
		throw new Error(
			'The currently authenticated account does not have permission to view SQL import status.'
		);
	}

	const runningSprite = new RunningSprite();

	const getResults = () =>
		new Promise( ( resolve, reject ) => {
			const checkStatus = async () => {
				const { importStatus, importJob } = await getStatus( api, app.id, env.id );

				debug( { importJob } );

				if ( ! importJob ) {
					return resolve( 'No import job found' );
				}

				const {
					// completedAt, TODO when Parker support is present
					createdAt,
					progress: { status: jobStatus, steps },
				} = importJob;

				const {
					dbOperationInProgress,
					importInProgress,
					progress: importStepProgress,
				} = importStatus;

				debug( { createdAt, dbOperationInProgress, importInProgress, importStepProgress } );

				if ( importStepProgress?.started_at * 1000 > new Date( createdAt ).getTime() ) {
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

				singleLogLine( `
SQL Import Job Started at ${ createdAt } (${ new Date( createdAt ) })

Status:
${ formatJobSteps( steps, runningSprite ) }` );

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

		// break out of the singleLogLine
		console.log( '\n' );

		if ( typeof results === 'string' ) {
			// This type of result is not an importing error. e.g. no import job was found
			console.log( results );
			process.exit( 0 );
		}

		const {
			progress: { status },
		} = results;

		console.log( `=============================================================
Result: ${ status }
` );
	} catch ( importFailed ) {
		console.log( `
Result: ${ chalk.red( 'Failed' ) }
${ getErrorMessage( importFailed ) }
` );
		process.exit( 1 );
	}
}

export default {
	importSqlCheckStatus,
};
