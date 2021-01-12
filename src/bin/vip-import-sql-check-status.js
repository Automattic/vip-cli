#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
// import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { isSupportedApp } from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
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

const err = async message => {
	console.log( chalk.red( message.toString().replace( /^(Error: )*/, 'Error: ' ) ) );
	process.exit( 1 );
};

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
} )
	.option( 'poll', 'Check the status repeatedly until the import is complete' )
	.argv( process.argv, async ( arg: string[], { app, env, poll }, { trackEventWithContext } ) => {
		if ( ! isSupportedApp( app ) ) {
			await trackEventWithContext( 'import_sql_command_error', { errorType: 'unsupported-app' } );
			err( 'The type of application you specified does not currently support SQL imports.' );
		}

		await trackEventWithContext( 'import_sql_check_status_command_execute' );

		console.log( `Checking the sql import status for env ID: ${ env.id }, app ID: ${ env.appId }` );

		// If `poll` is truthy, check for an import that completes after "now"
		const now = new Date();

		// The server uses UNIX timestamps (second precision vs. ms)
		const afterTime = poll ? Math.floor( now.getTime() / 1000 ) : null;

		if ( poll ) {
			console.log( `Polling until an import is started after: ${ afterTime } ( ${ now } )` );
		}

		await importSqlCheckStatus( { afterTime, app, env } );
	} );
