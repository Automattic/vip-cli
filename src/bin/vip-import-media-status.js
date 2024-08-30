#!/usr/bin/env node

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { isSupportedApp } from '../lib/media-import/media-file-import';
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';
import { trackEventWithEnv } from '../lib/tracker';

const appQuery = `
	id,
	name,
	type,
	environments{
		id
		appId
		type
		name
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
} )
	.option(
		'exportFileErrorsToJson',
		'Export any file errors encountered to a JSON file instead of a plain text file',
		false
	)
	.option(
		'saveErrorLog',
		'Download file-error logs without prompting',
		false
	)
	.argv( process.argv, async ( arg, { app, env, exportFileErrorsToJson, saveErrorLog } ) => {
		const { id: envId, appId } = env;
		const track = trackEventWithEnv.bind( null, appId, envId );

		if ( ! isSupportedApp( app ) ) {
			await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
			exit.withError(
				'The type of application you specified does not currently support this feature'
			);
		}

		await track( 'import_media_check_status_command_execute' );

		const progressTracker = new MediaImportProgressTracker( [] );
		progressTracker.prefix = `
=============================================================
Checking the Media import status for your environment...
`;

		await mediaImportCheckStatus( {
			app,
			env,
			progressTracker,
			exportFileErrorsToJson,
			saveErrorLog,
		} );
	} );
