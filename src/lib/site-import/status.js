/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import debugLib from 'debug';
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { formatJobSteps, RunningSprite } from 'lib/cli/format';
import { currentUserCanImportForApp } from 'lib/site-import/db-file-import';

const debug = debugLib( '@automattic/vip:lib/site-import/status' );

const IMPORT_SQL_PROGRESS_POLL_INTERVAL = 5000;

/*
				importStatus {
					dbOperationInProgress
					importInProgress
					inMaintenanceMode
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
*/

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
			}
		}
	}
`;

export type ImportSqlCheckStatusInput = {
	app: Object,
	env: Object,
};

export async function importSqlCheckStatus( { app, env }: ImportSqlCheckStatusInput ) {
	const api = await API();

	if ( ! currentUserCanImportForApp( app ) ) {
		throw new Error(
			'The currently authenticated account does not have permission to view SQL import status.'
		);
	}

	const runningSprite = new RunningSprite();

	const getStatus = async () => {
		const response = await api.query( {
			query: IMPORT_SQL_PROGRESS_QUERY,
			variables: { id: app.id },
			fetchPolicy: 'network-only',
		} );
		const {
			data: {
				app: { environments },
			},
		} = response;
		const { importStatus, jobs } = environments.find( e => e.id === env.id );
		const importJob = jobs.find( ( { type } ) => type === 'sql_import' );
		return { importStatus, importJob };
	};

	const results = await new Promise( ( resolve, reject ) => {
		const checkStatus = async () => {
			const { importStatus, importJob } = await getStatus();

			debug( { importStatus, importJob } );

			if ( ! importJob ) {
				return reject( { error: 'No import job found' } );
			}

			const {
				createdAt,
				progress: { status, steps },
			} = importJob;

			if ( status === 'error' ) {
				return reject( { error: 'Import job failed', steps } );
			}

			if ( ! steps.length ) {
				return reject( { error: 'Could not enumerate the import job steps' } );
			}

			singleLogLine( '\n\nSQL Import Job Status:\n' + formatJobSteps( steps, runningSprite ) );

			if ( status !== 'running' ) {
				return resolve( importJob );
			}

			setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
		};

		// Kick off the check
		checkStatus();
	} );

	// break out of the singleLogLine
	console.log( '\n' );

	const {
		id: importId,
		createdAt,
		progress: { status },
	} = results;
	if ( ! importId ) {
		console.log( 'No import job found' );
	}

	console.log(
		`Results
===============================================================
Import started at ${ createdAt } (${ new Date( createdAt ) })
Result: ${ status }
===============================================================
`
	);
}

export default {
	importSqlCheckStatus,
};
