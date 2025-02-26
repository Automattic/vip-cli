#!/usr/bin/env node

import chalk from 'chalk';
import debugLib from 'debug';
import gql from 'graphql-tag';

import API from '../lib/api';
import command from '../lib/cli/command';
// eslint-disable-next-line no-duplicate-imports
import { formatEnvironment } from '../lib/cli/format';
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';
import { trackEventWithEnv } from '../lib/tracker';

const API_VERSION = 'v2';

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
	mutation StartMediaImport($input: AppEnvironmentStartMediaImportInput) {
		startMediaImport(input: $input) {
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

const usage = 'vip import media';

const debug = debugLib( 'vip:vip-import-media' );

// Command examples for the `vip import media` help prompt
const examples = [
	{
		usage: 'vip @example-app.production import media https://example.com/uploads.tar.gz',
		description:
			'Import the archived file "uploads.tar.gz" from a publicly accessible URL to a production environment.',
	},
	// Format error logs
	{
		usage:
			'vip @example-app.production import media https://example.com/uploads.tar.gz --overwriteExistingFiles --exportFileErrorsToJson',
		description:
			'Overwrite existing files with the imported files if they have the same file path and name, and format the error log for the import in JSON.',
	},
	// `media status` subcommand
	{
		usage: 'vip @example-app.production import media status',
		description: 'Check the status of the most recent media import.',
	},
	// `media abort` subcommand
	{
		usage: 'vip @example-app.production import media abort',
		description: 'Abort the currently running media import.',
	},
];

function isSupportedUrl( urlToTest ) {
	let url;
	try {
		url = new URL( urlToTest );
	} catch ( err ) {
		return false;
	}
	return url.protocol === 'http:' || url.protocol === 'https:';
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-media',
	requiredArgs: 1,
	usage,
	requireConfirm: `
${ chalk.red.bold(
	"NOTE: If the provided archive's directory structure contains an `uploads/` directory,"
) }
${ chalk.red.bold(
	'only the files present inside that directory will be imported and the rest will be ignored.'
) }
${ chalk.red.bold( 'If no `uploads/` directory is found, all files will be imported, as is.' ) }

Are you sure you want to import the contents of the URL?
`,
} )
	.command(
		'status',
		'Check the status of a currently running media import or retrieve an error log of the most recent media import.'
	)
	.command( 'abort', 'Abort the media import currently in progress.' )
	.option( 'exportFileErrorsToJson', 'Alias for --export-file-errors-to-json. (deprecated)' )
	.option( 'export-file-errors-to-json', 'Format the error log in JSON. Default is TXT.' )
	.option( 'saveErrorLog', 'Alias for --save-error-log. (deprecated)' )
	.option(
		'save-error-log',
		'Skip the confirmation prompt and download an error log for the import automatically.'
	)
	.option( 'overwriteExistingFiles', 'Alias for --overwrite-existing-files. (deprecated)', false )
	.option(
		'overwrite-existing-files',
		'Overwrite existing files with the imported files if they have the same path and file name.',
		false
	)
	.option(
		[ 't', 'allow-all-file-types' ],
		'Allow all files to be imported, bypass the file type validation rules.',
		false
	)
	.option(
		'importIntermediateImages',
		'Alias for --import-intermediate-images. (deprecated)',
		false
	)
	.option( 'import-intermediate-images', 'Include intermediate image files in the import.', false )
	.examples( examples )
	.argv( process.argv, async ( args, opts ) => {
		const {
			app,
			env,
			exportFileErrorsToJson,
			saveErrorLog,
			overwriteExistingFiles,
			allowAllFileTypes,
			importIntermediateImages,
		} = opts;
		const [ url ] = args;

		if ( ! isSupportedUrl( url ) ) {
			console.log(
				chalk.red( `
Error:
	Invalid URL provided: ${ url }
	Please make sure that it is a publicly accessible web URL containing an archive of the media files to import.` )
			);
			return;
		}

		const track = trackEventWithEnv.bind( null, app.id, env.id );
		const api = API();

		debug( 'Options: ', opts );
		debug( 'Args:', args );

		await track( 'import_media_start_execute', {
			overwrite_existing_files: overwriteExistingFiles,
			allow_all_file_types: allowAllFileTypes,
			import_intermediate_images: importIntermediateImages,
		} );

		const progressTracker = new MediaImportProgressTracker( [] );
		progressTracker.prefix = `
=============================================================
Importing Media into your App...
`;

		console.log();
		console.log( `Importing archive from: ${ url }` );
		console.log( `to: ${ env.primaryDomain.name } (${ formatEnvironment( env.type ) })` );

		try {
			await api.mutate( {
				mutation: START_IMPORT_MUTATION,
				variables: {
					input: {
						applicationId: app.id,
						environmentId: env.id,
						archiveUrl: url,
						overwriteExistingFiles,
						importIntermediateImages,
						skipFileTypeValidation: allowAllFileTypes,
						apiVersion: API_VERSION,
					},
				},
			} );

			await mediaImportCheckStatus( {
				app,
				env,
				progressTracker,
				exportFileErrorsToJson,
				saveErrorLog,
			} );
		} catch ( error ) {
			if ( error.graphQLErrors ) {
				for ( const err of error.graphQLErrors ) {
					console.log( chalk.red( 'Error:' ), err.message );
				}

				return;
			}

			await track( 'import_media_start_execute_error', {
				error: `Error: ${ error.message }`,
			} );
		}
	} );
