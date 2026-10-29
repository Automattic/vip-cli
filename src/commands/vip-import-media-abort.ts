import { CombinedGraphQLErrors } from '@apollo/client/core';
import chalk from 'chalk';
import gql from 'graphql-tag';

import API from '../lib/api';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { isSupportedApp } from '../lib/media-import/media-file-import';
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import {
	mediaImportCheckStatus,
	type MediaImportCheckStatusInput,
} from '../lib/media-import/status';
import { trackEventWithEnv } from '../lib/tracker';

import type { App, AppEnvironment } from '../graphqlTypes';

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

export default command( {
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
	.argv(
		process.argv,
		async ( _arg: string[], { app, env }: { app: App; env: AppEnvironment } ) => {
			const { id: envId, appId } = env;
			const track = trackEventWithEnv.bind( null, appId as number, envId as number );

			if ( ! isSupportedApp( app ) ) {
				await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
				exit.withError(
					'The type of application you specified does not currently support media file imports.'
				);
			}
			const api = API();

			await track( 'import_media_abort_execute' );

			const progressTracker = new MediaImportProgressTracker(
				[] as unknown as ConstructorParameters< typeof MediaImportProgressTracker >[ 0 ]
			);
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
				await mediaImportCheckStatus( {
					app,
					env,
					progressTracker,
				} as MediaImportCheckStatusInput );
			} catch ( error ) {
				if ( CombinedGraphQLErrors.is( error ) ) {
					for ( const err of error.errors ) {
						console.log( chalk.red( 'Error:' ), err.message );
					}
					return;
				}
				await track( 'import_media_abort_execute_error', {
					error: `Error: ${ ( error as Error ).message }`,
				} );
			}
		}
	);
