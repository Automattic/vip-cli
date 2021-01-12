#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { currentUserCanImportForApp, isSupportedApp } from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
import { uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { validate } from 'lib/validations/sql';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';

const err = async message => {
	console.log( chalk.red( message.toString().replace( /^(Error: )*/, 'Error: ' ) ) );
	process.exit( 1 );
};

/**
 * TODO:
 * - Include `import_in_progress` state & error out if appropriate (this likely needs to be exposed in the data graph)
 * - Include `hasImporterS3Credentials` & error out if false (this needs to be implemented)
 */
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

const START_IMPORT_MUTATION = gql`
	mutation StartImport($input: AppEnvironmentImportInput) {
		startImport(input: $input) {
			app {
				id
				name
			}
			message
			success
		}
	}
`;

const debug = debugLib( '@automattic/vip:vip-import-sql' );

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	module: 'import-sql',
	requiredArgs: 1,
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
} )
	.example( 'vip import sql <file>', 'Import SQL provided in <file> to your site' )
	.option( 'search-replace', 'Specify the <from> and <to> pairs to be replaced' )
	.option( 'in-place', 'Perform the search and replace explicitly on the input file' )
	.argv( process.argv, async ( arg: string[], opts, { trackEventWithContext } ) => {
		const [ fileName ] = arg;
		const { app, env, searchReplace } = opts;
		const { importStatus } = env;

		console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		if ( ! currentUserCanImportForApp( app ) ) {
			err(
				'The currently authenticated account does not have permission to perform a SQL import.'
			);
		}

		if ( ! isSupportedApp( app ) ) {
			await trackEventWithContext( 'import_sql_command_error', { errorType: 'unsupported-app' } );
			err( 'The type of application you specified does not currently support SQL imports.' );
		}

		const previousStartedAt = importStatus.progress.started_at || 0;
		const previousFinishedAt = importStatus.progress.finished_at || 0;

		console.log( {
			importProgressAtLaunch: importStatus.progress,
			previousStartedAt,
			previousFinishedAt,
		} );

		if ( previousStartedAt && ! previousFinishedAt ) {
			await trackEventWithContext( 'import_sql_command_error', { errorType: 'existing-import' } );
			// TODO link to status page when one exists
			err( 'There is already an ongoing import for this site.' );
		}

		let fileNameToUpload = fileName;

		if ( searchReplace && searchReplace.length ) {
			const { outputFileName } = await searchAndReplace( fileName, searchReplace, {
				isImport: true,
				inPlace: opts.inPlace,
				output: true,
			} );

			if ( typeof outputFileName !== 'string' ) {
				// This should not really happen if `searchAndReplace` is functioning properly
				throw new Error(
					'Unable to determine location of the intermediate search & replace file.'
				);
			}

			fileNameToUpload = outputFileName;
		}

		await validate( fileNameToUpload, true );

		const api = await API();

		const startImportVariables = {};

		try {
			const {
				fileMeta: { basename, md5 },
				result,
			} = await uploadImportSqlFileToS3( { app, env, fileName: fileNameToUpload } );
			startImportVariables.input = {
				id: app.id,
				environmentId: env.id,
				basename: basename,
				md5: md5,
			};

			console.log( { basename, md5, result } );
		} catch ( e ) {
			err( e );
		}

		try {
			const { serverTime } = await api.mutate( {
				mutation: START_IMPORT_MUTATION,
				variables: startImportVariables,
			} );

			await trackEventWithContext( 'import_sql_command_queued' );

			console.log( '🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );

			await importSqlCheckStatus( { afterTime: serverTime, app, env } );
		} catch ( gqlErr ) {
			await trackEventWithContext( 'import_sql_command_error', {
				errorType: 'StartImport-failed',
				gqlErr,
			} );
			err( `StartImport call failed: ${ gqlErr }` );
		}
	} );
