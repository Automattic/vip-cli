#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import { trackEventWithEnv } from 'lib/tracker';
import * as exit from 'lib/cli/exit';

/**
 * Internal dependencies
 */
import { isSupportedApp } from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
import command from 'lib/cli/command';
import { ProgressTracker } from 'lib/cli/progress';

const appQuery = `
id,
name,
type,
environments{
	id
	appId
	type
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
} ).argv( process.argv, async ( arg: string[], { app, env } ) => {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support Media imports.'
		);
	}

	await track( 'import_media_check_status_command_execute' );

	const progressTracker = new ProgressTracker( [] );
	progressTracker.prefix = `
=============================================================
Checking the SQL import status for your environment...
`;

	await importSqlCheckStatus( { app, env, progressTracker } );
} );
