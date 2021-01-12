/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import debugLib from 'debug';
//import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const debug = debugLib( '@automattic/vip:lib/site-import/status' );

const IMPORT_SQL_PROGRESS_POLL_INTERVAL = 5000;

const IMPORT_SQL_PROGRESS_QUERY = gql`
	query App($id: Int) {
		app(id: $id) {
			environments {
				id
				importStatus {
					dbOperationInProgress
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
	afterTime: Number | null,
	app: Object,
	env: Object,
};

export async function importSqlCheckStatus( { afterTime, app, env }: ImportSqlCheckStatusInput ) {
	const api = await API();

	const getImportStatus = async () => {
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
		const { importStatus } = environments.find( e => e.id === env.id );
		return importStatus;
	};

	const importStatus = await new Promise( ( resolve, reject ) => {
		const checkStatus = async () => {
			const status = await getImportStatus();

			if ( ! afterTime ) {
				// No polling. This is a single shot check. Just return the status.
				return resolve( status );
			}

			debug( { status } );

			const { dbOperationInProgress, progress } = status;

			if ( progress?.started_at && ! progress.finished_at ) {
				const { steps = [] } = progress;
				const failedStep = steps.findIndex( ( { result } ) => result === 'failed' );
				if ( failedStep !== -1 ) {
					return reject( `Failed at step # ${ failedStep }: (${ steps[ failedStep ]?.name })` );
				}

				console.log( 'Running...' );
				setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
				return;
			}

			if ( ! progress || progress.started_at < afterTime ) {
				// The job that initiates the import has not been picked up yet
				console.log( 'Waiting for import to start...' );
				setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
				return;
			}

			if ( progress.finished_at ) {
				// All done, let's see if it succeeded

				const { steps = [] } = progress;
				const failedStep = steps.findIndex( ( { result } ) => result === 'failed' );
				if ( failedStep !== -1 ) {
					return reject( `Failed at step # ${ failedStep }: (${ steps[ failedStep ]?.name })` );
				}

				if ( dbOperationInProgress ) {
					// TODO -- check maint mode, etc. here as well
					console.log( 'SQL file imported. Site is "reloading."' );
					setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
					return;
				}

				// 🎉🥳🎊
				return resolve( status );
			}

			// The import is still in progress, report the status

			// TODO add copy on how to exit polling & what to expect, etc.
			// TODO format this better, obviously :)
			const output = `
            Polling for Import Status:
            Last updated: ${ new Date().toString() }
            ${ JSON.stringify( { dbOperationInProgress, progress } ) }
            `;
			//singleLogLine( output );
			console.log( output );

			// Run this check again after a timeout
			setTimeout( checkStatus, IMPORT_SQL_PROGRESS_POLL_INTERVAL );
		};

		// Kick off the check
		checkStatus();
	} );

	console.log( '\n', { importStatus } );
}

export default {
	importSqlCheckStatus,
};
