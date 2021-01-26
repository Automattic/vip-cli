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
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
} from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
import { getFileSize, uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { validate } from 'lib/validations/sql';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';

const err = async message => {
	console.log( chalk.red( message.toString().replace( /^(Error: )*/, 'Error: ' ) ) );
	process.exit( 1 );
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

const debug = debugLib( '@automattic/vip:vip-import-sql' );

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
	.option( 'search-replace', 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option(
		'output',
		'Specify the replacement output file for Search and Replace',
		'process.stdout'
	)
	.examples( examples )
	.argv( process.argv, async ( arg: string[], opts, { trackEventWithContext } ) => {
		const { app, env, searchReplace } = opts;
		const [ fileName ] = arg;

		await trackEventWithContext( 'import_sql_command_execute' );

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

		const {
			importStatus: { dbOperationInProgress, importInProgress },
		} = env;

		if ( dbOperationInProgress ) {
			await trackEventWithContext( 'import_sql_command_error', { errorType: 'existing-dbop' } );
			err( 'There is already a database operation in progress. Please try again later.' );
		}

		if ( importInProgress ) {
			await trackEventWithContext( 'import_sql_command_error', { errorType: 'existing-import' } );
			err(
				'There is already an import in progress. You can view the status with the `vip import sql status` command.'
			);
		}

		const fileSize = await getFileSize( fileName );

		if ( ! fileSize ) {
			err( `File '${ fileName }' is empty.` );
		}

		if ( fileSize > SQL_IMPORT_FILE_SIZE_LIMIT ) {
			err(
				`The sql import file size (${ fileSize } bytes) exceeds the limit the limit (${ SQL_IMPORT_FILE_SIZE_LIMIT } bytes).` +
					'Please split it into multiple files or contact support for assistance.'
			);
		}

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

		// Run SQL validation
		await validate( fileNameToUpload, true );

		// Call the Public API
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
			debug( { basename, md5, result } );
		} catch ( e ) {
			err( e );
		}

		try {
			const startImportResults = await api.mutate( {
				mutation: START_IMPORT_MUTATION,
				variables: startImportVariables,
			} );

			debug( { startImportResults } );
		} catch ( gqlErr ) {
			await trackEventWithContext( 'import_sql_command_error', {
				errorType: 'StartImport-failed',
				gqlErr,
			} );
			err( `StartImport call failed: ${ gqlErr }` );
		}

		console.log( 'Upload complete. Initiating the import.' );

		await importSqlCheckStatus( { app, env } );
	} );
