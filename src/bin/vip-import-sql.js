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
import { uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEvent } from 'lib/tracker';
import { validate, getReadInterface } from 'lib/validations/sql';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';

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

const trackEventWithEnv = async ( appId, envId, eventName, eventProps = {} ) => {
	return trackEvent( eventName, { ...eventProps, app_id: appId, env_id: envId } );
};

const isMultiSiteDumpFile = fileName => {
	return new Promise( async resolve => {
		const readInterface = await getReadInterface( fileName );
		readInterface.on( 'line', line => {
			const multiSiteTableNameRegex = /^CREATE TABLE `?(wp_\d_[a-z0-9_]*)/i;
			// determine if we're on a CREATE TABLE statement line what has eg. wp_\d_options
			if ( multiSiteTableNameRegex.test( line ) ) {
				resolve( true );
			}
		} );

		readInterface.on( 'error', () => {
			err( 'An error was encountered while reading your SQL dump file.  Please verify the file contents.' );
		} );
		// Block until the processing completes
		await new Promise( resolveBlock => readInterface.on( 'close', resolveBlock ) );
		resolve( false );
	} );
};

const isMultiSiteInSiteMeta = async ( appId: number, envId: number, api: Object ): Promise<boolean> => {
	let res;
	try {
		res = await api.query( {
			query: gql`query AppMultiSiteCheck( $appId: Int, $envId: Int) {
				app(id: $appId) {
					id
					name
					repo
					environments(id: $envId) {
						id
						appId
						name
						type
						isMultisite
						isSubdirectoryMultisite
					}
				}
			}`,
			variables: {
				appId,
				envId,
			},
		} );
	} catch ( GraphQlError ) {
		await trackEventWithEnv( 'import_sql_command_error', {
			error_type: 'GraphQL-MultiSite-Check-failed',
			gql_err: GraphQlError,
		} );
		err( `StartImport call failed: ${ GraphQlError }` );
	}

	if ( Array.isArray( res?.data?.app?.environments ) ) {
		const environments = res.data.app.environments;
		if ( ! environments.length ) {
			return false;
		}
		// we asked for one result with one appId and one envId, so...
		const thisEnv = environments[ 0 ];
		if ( thisEnv.isMultiSite || thisEnv.isSubdirectoryMultisite ) {
			return true;
		}
	}

	return false;
};

const gates = async ( app, env, fileName, api ) => {
	const { id: envId, appId } = env;
	trackEventWithEnv.bind( null, appId, envId );

	if ( ! currentUserCanImportForApp( app ) ) {
		err(
			'The currently authenticated account does not have permission to perform a SQL import.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await trackEventWithEnv( 'import_sql_command_error', { error_type: 'unsupported-app' } );
		err( 'The type of application you specified does not currently support SQL imports.' );
	}

	// is the import for a multisite?
	const isMultiSiteSqlDump = await isMultiSiteDumpFile( fileName );
	const isMultiSite = await isMultiSiteInSiteMeta( appId, envId, api );

	// if site is a multisite but import sql is not
	if ( isMultiSite && ! isMultiSiteSqlDump ) {
		await trackEventWithEnv( 'import_sql_command_error', { error_type: 'multisite-but-not-multisite-sql-dump' } );
		err( 'You have provided a non-multisite SQL dump file for import into a multisite.' );
	}

	// if site is a single site but import sql is for a multi site
	if ( ! isMultiSite && isMultiSiteSqlDump ) {
		await trackEventWithEnv( 'import_sql_command_error', { error_type: 'not-multisite-with-multisite-sql-dump' } );
		err( 'You have provided a multisite SQL dump file for import into a single site (non-multisite).' );
	}
};

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-sql',
	requiredArgs: 1,
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
} )
	.example( 'vip import sql <file>', 'Import SQL provided in <file> to your site' )
	.option( 'search-replace', 'Specify the <from> and <to> pairs to be replaced' )
	.option( 'in-place', 'Perform the search and replace explicitly on the input file' )
	.argv( process.argv, async ( arg, opts ) => {
		const { app, env, searchReplace } = opts;
		const [ fileName ] = arg;
		const api = await API();

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );
		trackEventWithEnv.bind( null, env.appId, env.id );
		await trackEventWithEnv( 'import_sql_command_execute' );

		// halt operation of the import based on some rules
		await gates( app, env, fileName, api );

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
		try {
			const {
				fileMeta: { basename, md5 },
				result,
			} = await uploadImportSqlFileToS3( { app, env, fileName: fileNameToUpload } );

			console.log( { basename, md5, result } );

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
				await trackEventWithEnv( 'import_sql_command_error', {
					error_type: 'StartImport-failed',
					gql_err: gqlErr,
				} );
				err( `StartImport call failed: ${ gqlErr }` );
			}

			await trackEventWithEnv( 'import_sql_command_queued' );

			console.log( '\n🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );
			// TOD0: Remove the log below before the PUBLIC release
			console.log( '--> Check the status of your import via the \`import_progress\` site meta in the VIP internal console!\n' );
			console.log( '===================================' );
		} catch ( e ) {
			err( e );
		}
	} );
