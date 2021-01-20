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
import { currentUserCanImportForApp, isSupportedApp, SQL_IMPORT_FILE_SIZE_LIMIT } from 'lib/site-import/db-file-import';
import { getFileSize, uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEvent } from 'lib/tracker';
import { formatEnvironment } from 'lib/cli/format';
import { validate } from 'lib/validations/sql';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';
import { progress } from 'lib/cli/progress';

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

const err = message => {
	console.log( chalk.red( message.toString().replace( /^(Error: )*/, 'Error: ' ) ) );
	process.exit( 1 );
};

const debug = debugLib( 'vip:vip-import-sql' );

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
		const [ fileName ] = arg;

		const trackEventWithEnv = async ( eventName, eventProps = {} ) =>
			trackEvent( eventName, { ...eventProps, app_id: env.appId, env_id: env.id } );

		await trackEventWithEnv( 'import_sql_command_execute' );

		console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		if ( ! currentUserCanImportForApp( app ) ) {
			err(
				'The currently authenticated account does not have permission to perform a SQL import.'
			);
		}

		if ( ! isSupportedApp( app ) ) {
			await trackEventWithEnv( 'import_sql_command_error', { error_type: 'unsupported-app' } );
			err( 'The type of application you specified does not currently support SQL imports.' );
		}

		const fileSize = await getFileSize( fileName );

		if ( ! fileSize ) {
			err( `File '${ fileName }' is empty.` );
		}

		if ( fileSize > SQL_IMPORT_FILE_SIZE_LIMIT ) {
			err(
				`The sql import file size (${ fileSize } bytes) exceeds the limit the limit (${ SQL_IMPORT_FILE_SIZE_LIMIT } bytes).` +
				'Please split it into multiple files or contact support for assistance.' );
		}

		// Log summary of import details
		const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;

		console.log( `  importing: ${ chalk.blueBright( fileName ) }` );
		console.log( `         to: ${ chalk.cyan( domain ) }` );
		console.log( `       site: ${ app.name }(${ formatEnvironment( opts.env.type ) })` );
		searchReplace ? '' : console.log();

		if ( searchReplace && searchReplace.length ) {
			const params = searchReplace.split( ',' );

			console.log( `        s-r: ${ chalk.blue( params[ 0 ] ) } -> ${ chalk.blue( params [ 1 ] ) }\n` );
		}

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

		// Run SQL validation
		await validate( fileNameToUpload, true );

		// Call the Public API
		const api = await API();

		try {
			const {
				fileMeta: { basename, md5 },
				result,
			} = await uploadImportSqlFileToS3( { app, env, fileName: fileNameToUpload } );

			debug( { basename, md5, result } );
			debug( 'Upload complete. Initiating the import.' );
			progress( 'running', 'startImport' );

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
				progress( 'success', 'startImport' );
			} catch ( gqlErr ) {
				progress( 'failed', 'startImport' );
				await trackEventWithEnv( 'import_sql_command_error', {
					error_type: 'StartImport-failed',
					gql_err: gqlErr,
				} );
				err( `StartImport call failed: ${ gqlErr }` );
			}

			progress( 'running', 'import' );
			await trackEventWithEnv( 'import_sql_command_queued' );

			console.log( '\n🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );
			// TOD0: Remove the log below before the PUBLIC release
			console.log( '--> Check the status of your import via the \`import_progress\` site meta in the VIP internal console!\n' );
			console.log( '===================================' );
		} catch ( e ) {
			err( e );
		}
	} );
