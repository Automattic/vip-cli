#!/usr/bin/env node

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { isSupportedApp } from '../lib/media-import/media-file-import';
import command from '../lib/cli/command';
import API from '../lib/api';
import * as exit from '../lib/cli/exit';
// eslint-disable-next-line no-duplicate-imports
import { trackEventWithEnv } from '../lib/tracker';
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';

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

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	requireConfirm: `
${ chalk.red.bold(
	"By running this command, the Media Import running on your App will stop and can't be resumed."
) }
${ chalk.red.bold( 'Are you sure you want to abort this Media Import?' ) }
`,
} ).argv( process.argv, async ( arg, { app, env } ) => {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support Media imports.'
		);
	}
	const api = await API();

	await track( 'import_media_abort_execute' );

	const progressTracker = new MediaImportProgressTracker( [] );
	progressTracker.prefix = `
=============================================================
Aborting the Media Import running on your App
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
