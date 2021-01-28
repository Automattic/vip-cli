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

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
} from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
import { checkFileAccess, getFileSize, uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEventWithEnv } from 'lib/tracker';
import { staticSqlValidations } from 'lib/validations/sql';
import { siteTypeValidations } from 'lib/validations/site-type';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';
import * as exit from 'lib/cli/exit';
import { fileLineValidations } from 'lib/validations/line-by-line';

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
		syncProgress { status }
		primaryDomain { name }
		importStatus {
			dbOperationInProgress
			importInProgress
		}
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

const debug = debugLib( 'vip:vip-import-sql' );

const gates = async ( app, env, fileName ) => {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! currentUserCanImportForApp( app ) ) {
		await track( 'import_sql_command_error', { error_type: 'unauthorized' } );
		exit.withError(
			'The currently authenticated account does not have permission to perform a SQL import.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_sql_command_error', { error_type: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support SQL imports.'
		);
	}

	try {
		await checkFileAccess( fileName );
	} catch ( e ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-missing' } );
		exit.withError( `File '${ fileName }' does not exist or is not readable.` );
	}

	const fileSize = await getFileSize( fileName );

	if ( ! fileSize ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-empty' } );
		exit.withError( `File '${ fileName }' is empty.` );
	}

	if ( fileSize > SQL_IMPORT_FILE_SIZE_LIMIT ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-toobig' } );
		exit.withError(
			`The sql import file size (${ fileSize } bytes) exceeds the limit (${ SQL_IMPORT_FILE_SIZE_LIMIT } bytes).` +
				'Please split it into multiple files or contact support for assistance.'
		);
	}

	const {
		importStatus: { dbOperationInProgress, importInProgress },
	} = env;

	if ( dbOperationInProgress ) {
		await track( 'import_sql_command_error', { errorType: 'existing-dbop' } );
		exit.withError( 'There is already a database operation in progress. Please try again later.' );
	}

	if ( importInProgress ) {
		await track( 'import_sql_command_error', { errorType: 'existing-import' } );
		exit.withError(
			'There is already an import in progress. You can view the status with the `vip import sql status` command.'
		);
	}
};
// Command examples
const examples = [
	// `sql` subcommand
	{
		usage: 'vip import sql @mysite.develop <file.sql>',
		description: 'Import the given SQL file to your site',
	},
	// `search-replace` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to"',
		description:
			'Perform a Search and Replace, then import the replaced file to your site.\n' +
			'       * Ensure there are no spaces between your search-replace parameters',
	},
	// `in-place` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --in-place',
		description:
			'Search and Replace on the input <file.sql>, then import the replaced file to your site',
	},
	// `output` flag
	{
		usage:
			'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --output="<output.sql>"',
		description:
			'Output the performed Search and Replace to the specified output file, then import the replaced file to your site\n' +
			'       * Has no effect when the `in-place` flag is used',
	},
	// `sql status` subcommand
	{
		usage: 'vip import sql status @mysite.develop',
		description:
			'Check the status of the most recent import. If an import is running, this will poll until it is complete.',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	module: 'import-sql',
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
} )
	.command( 'status', 'Check the status of the current running import' )
	.option( 'search-replace', 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option(
		'output',
		'Specify the replacement output file for Search and Replace',
		'process.stdout'
	)
	.examples( examples )
	.argv( process.argv, async ( arg: string[], opts ) => {
		const { app, env, searchReplace } = opts;
		const { id: envId, appId } = env;
		const [ fileName ] = arg;

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

		const track = trackEventWithEnv.bind( null, appId, envId );

		await track( 'import_sql_command_execute' );

		// // halt operation of the import based on some rules
		await gates( app, env, fileName );

		let fileNameToUpload = fileName;
		// Run Search and Replace if the --search-replace flag was provided
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

		// VALIDATIONS
		const validations = [];
		validations.push( staticSqlValidations );
		validations.push( siteTypeValidations );
		await fileLineValidations( appId, envId, fileNameToUpload, validations );

		// Call the Public API
		const api = await API();

		const startImportVariables = {};

		console.log( 'Uploading…' );

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
			debug( { basename, md5, result } );
			console.log( 'Upload complete. Initiating the import.' );

			await track( 'import_sql_upload_complete' );

			console.log( '\n🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );
		} catch ( e ) {
			await track( 'import_sql_command_error', { error_type: 'upload_failed', e } );
			exit.withError( e );
		}

		try {
			const startImportResults = await api.mutate( {
				mutation: START_IMPORT_MUTATION,
				variables: startImportVariables,
			} );

			debug( { startImportResults } );
		} catch ( gqlErr ) {
			await track( 'import_sql_command_error', {
				error_type: 'StartImport-failed',
				gql_err: gqlErr,
			} );
			exit.withError( `StartImport call failed: ${ gqlErr }` );
		}

		await importSqlCheckStatus( { app, env } );
	} );
