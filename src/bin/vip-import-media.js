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
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
	SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED,
} from 'lib/site-import/db-file-import';
// eslint-disable-next-line no-duplicate-imports
import { trackEventWithEnv } from 'lib/tracker';
import { formatEnvironment, formatSearchReplaceValues, getGlyphForStatus } from 'lib/cli/format';
import { MediaImportProgressTracker } from 'lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';

export type WPSiteListType = {
	id: string,
	homeUrl: string,
};

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
		launched
		primaryDomain { name }
		wpSites {
			nodes {
				homeUrl
				id
			}
		}
	}
`;

const START_IMPORT_MUTATION = gql`
	mutation StartMediaImport($input:AppEnvironmentStartMediaImportInput) {
		startMediaImport(input: $input) {
			applicationId
			environmentId
			mediaImportStatus {
				importId
				siteId
				status
				filesTotal
				filesProcessed
			}
		}
	}
`;

const debug = debugLib( 'vip:vip-import-media' );

// Command examples for the `vip import media` help prompt
const examples = [
	// `media status` subcommand
	{
		usage: 'vip import media @mysite.develop --url https://domain.to/archive.zip',
		description:
			'Start a media import with the contents of the archive file in the URL',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-media',
	requireConfirm: 'Are you sure you want to import the contents of the url?',
} )
	// .command( 'status', 'Check the status of the current running import' )
	.option( 'url', 'Valid URL to download a file archive from', '' )
	.examples( examples )
	.argv( process.argv, async ( args: string[], opts ) => {
		const { app, env, url } = opts;

		if ( ! url ) {
			console.log( chalk.red( 'Error:' ), 'No URL provided' );
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
Starting Media Import for your environment...
`;

		console.log();
		console.log( `importing: ${ url }` );
		console.log( `to: ${ env.primaryDomain.name }` );
		console.log( `site: ${ env.name } (${ env.type })` );
		console.log();

		try {
			const response = await api
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
			console.log( response );

			await mediaImportCheckStatus( { app, env, progressTracker } );
		} catch ( e ) {
			if ( e.graphQLErrors ) {
				for ( const err of e.graphQLErrors ) {
					console.log( chalk.red( 'Error:' ), err.message );
				}

				return;
			}

			await track( 'import_media_start_execute_error', {
				error: `Error starting: ${ e.message }`,
			} );
		}
	} );

