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
import { currentUserCanImportForApp, isSupportedApp, SQL_IMPORT_FILE_SIZE_LIMIT } from 'lib/site-import/db-file-import';
import { getFileSize, uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEventWithEnv } from 'lib/tracker';
import { staticSqlValidations } from 'lib/validations/sql';
import { siteTypeValidations } from 'lib/validations/site-type';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';
import * as exit from 'lib/cli/exit';
import { fileLineValidations } from 'lib/validations/line-by-line';

/**
 * - Include `import_in_progress` state & error out if appropriate (this likely needs to be exposed in the data graph)
 * - Include `hasImporterS3Credentials` & error out if false (this needs to be implemented)
 */
const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{ id, appId, type, name, syncProgress { status }, primaryDomain { name } }
`;

const debug = debugLib( 'vip:vip-import-sql' );

const gates = async ( app, env, fileName ) => {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! currentUserCanImportForApp( app ) ) {
		exit.withError(
			'The currently authenticated account does not have permission to perform a SQL import.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_sql_command_error', { error_type: 'unsupported-app' } );
		exit.withError( 'The type of application you specified does not currently support SQL imports.' );
	}

	const fileSize = await getFileSize( fileName );

	if ( ! fileSize ) {
		exit.withError( `File '${ fileName }' is empty.` );
	}

	if ( fileSize > SQL_IMPORT_FILE_SIZE_LIMIT ) {
		exit.withError(
			`The sql import file size (${ fileSize } bytes) exceeds the limit (${ SQL_IMPORT_FILE_SIZE_LIMIT } bytes).` +
				'Please split it into multiple files or contact support for assistance.' );
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
		description: 'Perform a Search and Replace, then import the replaced file to your site.\n' +
		'       * Ensure there are no spaces between your search-replace parameters',
	},
	// `in-place` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --in-place',
		description: 'Search and Replace on the input <file.sql>, then import the replaced file to your site',
	},
	// `output` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --output="<output.sql>"',
		description: 'Output the performed Search and Replace to the specified output file, then import the replaced file to your site\n' +
		'       * Has no effect when the `in-place` flag is used',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-sql',
	requiredArgs: 1,
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
} )
	.option( 'search-replace', 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option( 'output', 'Specify the replacement output file for Search and Replace', 'process.stdout' )
	.examples( examples )
	.argv( process.argv, async ( arg, opts ) => {
		const { app, env, searchReplace } = opts;
		const { id: envId, appId } = env;
		const [ fileName ] = arg;
		const api = await API();

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
			fileNameToUpload = outputFileName;
		}

		// VALIDATIONS
		const validations = [];
		validations.push( staticSqlValidations );
		validations.push( siteTypeValidations );
		await fileLineValidations( appId, envId, fileNameToUpload, validations );

		// Call the Public API
		try {
			const {
				fileMeta: { basename, md5 },
				result,
			} = await uploadImportSqlFileToS3( { app, env, fileName: fileNameToUpload } );

			debug( { basename, md5, result } );
			console.log( 'Upload complete. Initiating the import.' );

			try {
				await api.mutate( {
					mutation: gql`
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
					`,
					variables: {
						input: {
							id: app.id,
							environmentId: env.id,
							basename: basename,
							md5: md5,
						},
					},
				} );
			} catch ( gqlErr ) {
				await track( 'import_sql_command_error', {
					error_type: 'StartImport-failed',
					gql_err: gqlErr,
				} );
				exit.withError( `StartImport call failed: ${ gqlErr }` );
			}

			await track( 'import_sql_command_queued' );

			console.log( '\n🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );
			// TOD0: Remove the log below before the PUBLIC release
			console.log( '--> Check the status of your import via the \`import_progress\` site meta in the VIP internal console!\n' );
			console.log( '===================================' );
		} catch ( e ) {
			exit.withError( e );
		}
	} );
