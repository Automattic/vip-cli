#!/usr/bin/env node

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { ProgressTracker } from '../lib/cli/progress';
import { isSupportedApp } from '../lib/site-import/db-file-import';
import { importSqlCheckStatus } from '../lib/site-import/status';
import { trackEventWithEnv } from '../lib/tracker';

const appQuery = `
id,
name,
type,
typeId,
environments{
	id
	appId
	type
	name
	isK8sResident
	primaryDomain {
		id
		name
	}
}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
} ).argv( process.argv, async ( arg, { app, env } ) => {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_sql_command_error', { errorType: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support SQL imports.'
		);
	}

	await track( 'import_sql_check_status_command_execute' );

	const progressTracker = new ProgressTracker( [] );
	progressTracker.prefix = `
=============================================================
Checking the SQL import status for your environment...
`;

	await importSqlCheckStatus( {
		app,
		env,
		progressTracker,
		shouldReturnMissingJobImmediately: true,
	} );
} );
