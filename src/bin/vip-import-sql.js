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

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { currentUserCanImportForApp, isSupportedApp } from 'lib/site-import/db-file-import';
import { uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEvent } from 'lib/tracker';
import { validate } from 'lib/validations/sql';
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

command( {
	appContext: true,
	appQuery,
	requiredArgs: 1, // TODO print proper usage example
	envContext: true,
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
} ).argv( process.argv, async ( arg, opts ) => {
	const { app, env } = opts;
	const [ fileName ] = arg;

	const trackEventWithEnv = async ( eventName, eventProps = {} ) =>
		trackEvent( eventName, { ...eventProps, appId: env.appId, envId: env.id } );

	await trackEventWithEnv( 'import_sql_command_execute' );

	console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

	if ( ! currentUserCanImportForApp( app ) ) {
		err( 'The currently authenticated account does not have permission to perform a SQL import.' );
	}

	if ( ! isSupportedApp( app ) ) {
		await trackEventWithEnv( 'import_sql_command_error', { errorType: 'unsupported-app' } );
		err( 'The type of application you specified does not currently support SQL imports.' );
	}

	await validate( fileName );

	/**
	 * TODO: We should check for various site locks (including importing) prior to the upload.
	 */

	const api = await API();

	try {
		const { fileMeta: { basename, md5 }, result } = await uploadImportSqlFileToS3( { app, env, fileName } );

		console.log( { basename, md5, result } );

		try {
			await api
				.mutate( {
					mutation: gql`
						mutation StartImport($input: AppEnvironmentImportInput){
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
			await trackEventWithEnv( 'import_sql_command_error', { errorType: 'StartImport-failed', gqlErr } );
			err( `StartImport call failed: ${ gqlErr }` );
		}

		await trackEventWithEnv( 'import_sql_command_queued' );

		console.log( '🚧 🚧 🚧 Your sql file import is queued 🚧 🚧 🚧' );

		console.log(
			`VIP Testers: Thank you for testing!
			We are currently working on adding support for showing the import status here.
			For now, you can monitor the \`import_progress\` site meta.`
		);
	} catch ( e ) {
		err( e );
	}
} );
