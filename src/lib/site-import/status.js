/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';
//import debugLib from 'debug';
//import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';

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
	app: Object,
	env: Object,
	poll: boolean,
};

export async function importSqlCheckStatus( { app, env, poll }: ImportSqlCheckStatusInput ) {
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

	const importStatus = await new Promise( resolve => {
		const checkStatus = async () => {
			const status = await getImportStatus();
			const { dbOperationInProgress, progress } = status;

			if ( progress && progress.finished_at ) {
				return resolve( status );
			}

			if ( poll ) {
				// TODO add copy on how to exit polling & what to expect, etc.
				// TODO format this better, obviously :)
				const output = `
Polling for Import Status:
Last updated: ${ new Date().toString() }
${ JSON.stringify( { dbOperationInProgress, progress } ) }
`;
				//singleLogLine( output );
				console.log( output );
			} else {
				return resolve( status );
			}

			setTimeout( checkStatus, 5000 );
		};
		checkStatus();
	} );

	console.log( '\n', { importStatus } );
}

export default {
	importSqlCheckStatus,
};
