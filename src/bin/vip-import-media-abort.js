#!/usr/bin/env node

import chalk from 'chalk';
import gql from 'graphql-tag';

import API from '../lib/api';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { isSupportedApp } from '../lib/media-import/media-file-import';
// eslint-disable-next-line no-duplicate-imports
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip import media abort';

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

const ABORT_IMPORT_MUTATION = gql`
	mutation AbortMediaImport($input: AppEnvironmentAbortMediaImportInput) {
		abortMediaImport(input: $input) {
			applicationId
			environmentId
			mediaImportStatusChange {
				importId
				siteId
				statusFrom
				statusTo
			}
		}
	}
`;

// Command examples
const examples = [
	{
		usage: `vip @example-app.production import media abort`,
		description:
			'Abort the media file import that is currently in progress on the production environment of the "example-app" application.',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	usage,
	requireConfirm: `
${ chalk.red.bold(
	'Running this command will stop the currently running media import. The import process cannot be resumed.'
) }
${ chalk.red.bold( 'Are you sure you want to abort this media import?' ) }
`,
} )
	.examples( examples )
	.argv( process.argv, async ( arg, { app, env } ) => {
		const { id: envId, appId } = env;
		const track = trackEventWithEnv.bind( null, appId, envId );

		if ( ! isSupportedApp( app ) ) {
			await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
			exit.withError(
				'The type of application you specified does not currently support media file imports.'
			);
		}
		const api = API();

		await track( 'import_media_abort_execute' );

		const progressTracker = new MediaImportProgressTracker( [] );
		progressTracker.prefix = `
=============================================================
Aborting this media import.
`;

		try {
			await api.mutate( {
				mutation: ABORT_IMPORT_MUTATION,
				variables: {
					input: {
						applicationId: app.id,
						environmentId: env.id,
					},
				},
			} );
			await mediaImportCheckStatus( { app, env, progressTracker } );
		} catch ( error ) {
			if ( error.graphQLErrors ) {
				for ( const err of error.graphQLErrors ) {
					console.log( chalk.red( 'Error:' ), err.message );
				}
				return;
			}
			await track( 'import_media_abort_execute_error', {
				error: `Error: ${ error.message }`,
			} );
		}
	} );
