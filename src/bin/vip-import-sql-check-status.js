#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import { trackEvent } from 'lib/tracker';
import API from 'lib/api';
import gql from 'graphql-tag';
//import debugLib from 'debug';
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

// TODO: Share this with the import-sql command...?
const appQuery = `
id,
name,
type,
organization { id, name },
environments{
	id
	appId
	type
	name
	importStatus {
		dbOperationInProgress
		progress {
			started_at
			steps { name, started_at, finished_at, result, output }
			finished_at
		}
	}
	syncProgress { status }
	primaryDomain { name }
}
`;

const IMPORT_PROGRESS_QUERY = gql`
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

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-sql',
	requiredArgs: 0,
} )
	.option( 'poll', 'Check the status repeatedly until the import is complete' )
	.argv( process.argv, async ( arg: string[], opts ) => {
		const { app, env, poll } = opts;
		const trackEventWithEnv = async ( eventName, eventProps = {} ) =>
			trackEvent( eventName, { ...eventProps, appId: env.appId, envId: env.id } );

		// TODO track if this command was called independently from the vip-import-sql command
		await trackEventWithEnv( 'import_sql_check_status_command_execute', {} );

		const api = await API();

		const getImportStatus = async () => {
			const response = await api.query( {
				query: IMPORT_PROGRESS_QUERY,
				variables: { id: app.id },
				fetchPolicy: 'network-only',
			} );
			const {
				data: {
					app: { environments },
				},
				_date,
			} = response;
			console.log( { response, _date } );
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
					// TODO format this better :)
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

		if ( opts.isImporting ) {
			console.log( 'Finished importing your SQL file....' );
		}
	} );
