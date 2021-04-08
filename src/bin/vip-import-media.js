#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import API from 'lib/api';
// eslint-disable-next-line no-duplicate-imports
import { trackEventWithEnv } from 'lib/tracker';
import { formatEnvironment } from 'lib/cli/format';
import { MediaImportProgressTracker } from 'lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';

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
		primaryDomain { name }
	}
`;

const START_IMPORT_MUTATION = gql`
	mutation StartMediaImport( $input: AppEnvironmentStartMediaImportInput ) {
		startMediaImport( input: $input ) {
			applicationId
			environmentId
			mediaImportStatus {
				importId
				siteId
				status
			}
		}
	}
`;

const debug = debugLib( 'vip:vip-import-media' );

// Command examples for the `vip import media` help prompt
const examples = [
	{
		usage: 'vip import media @mysite.develop https://<path_to_publicly_accessible_archive>',
		description:
			'Start a media import with the contents of the archive file in the URL',
	},
	// `media status` subcommand
	{
		usage: 'vip import media status @mysite.develop',
		description:
			'Check the status of the most recent import. If an import is running, this will poll until it is complete.',
	},
];

function isSupportedUrl( urlToTest ) {
	const url = new URL( urlToTest );
	return url.protocol === 'http:' || url.protocol === 'https:';
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-media',
	requiredArgs: 1,
	requireConfirm: `
${ chalk.yellowBright.bold( 'NOTE: If the provided archive\'s directory structure begins with `/wp-content/uploads`,' ) }
${ chalk.yellowBright.bold( 'we will extract only the files after that path and import it. Otherwise, we will' ) }
${ chalk.yellowBright.bold( 'import all files and preserve the directory structure as is.' ) }

Are you sure you want to import the contents of the url?
`,
} )
	.command( 'status', 'Check the status of the current running import' )
	.examples( examples )
	.argv( process.argv, async ( args: string[], opts ) => {
		const { app, env } = opts;
		const [ url ] = args;

		if ( ! isSupportedUrl( url ) ) {
			console.log( chalk.red( `
Error: 
	Invalid URL provided: ${ url }
	Please make sure that it is a publicly accessible web URL containing an archive of the media files to import` ) );
			return;
		}

		const track = trackEventWithEnv.bind( null, app.id, env.id );
		const api = await API();

		debug( 'Options: ', opts );
		debug( 'Args:', args );

		await track( 'import_media_start_execute' );

		const progressTracker = new MediaImportProgressTracker( [] );
		progressTracker.prefix = `
=============================================================
Processing the files import for your environment...
`;

		console.log();
		console.log( `Importing archive from: ${ url }` );
		console.log( `to: ${ env.primaryDomain.name } (${ formatEnvironment( env.type ) })` );

		try {
			await api
				.mutate( {
					mutation: START_IMPORT_MUTATION,
					variables: {
						input: {
							applicationId: app.id,
							environmentId: env.id,
							archiveUrl: url,
						},
					},
				} );

			await mediaImportCheckStatus( { app, env, progressTracker } );
		} catch ( e ) {
			if ( e.graphQLErrors ) {
				for ( const err of e.graphQLErrors ) {
					console.log( chalk.red( 'Error:' ), err.message );
				}

				return;
			}

			await track( 'import_media_start_execute_error', {
				error: `Error: ${ e.message }`,
			} );
		}
	} );
