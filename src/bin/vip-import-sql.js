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
import { formatData } from '../lib/cli/format';
import { validate } from 'lib/validations/sql';
import API from 'lib/api';

/**
 * - Include `import_in_progress` state & error out if appropriate (this likely needs to be exposed in the data graph)
 * - Include `hasImporterS3Credentials` & error out if false (this needs to be implemented)
 */
const appQuery = `
	id,
	name,
	organization { id, name },
	environments{ id, appId, type, name, primaryDomain { name } }
`;

const err = message => {
	console.log( chalk.red( message.toString().replace( /^(Error: )*/, 'Error: ' ) ) );
	process.exit( 1 );
};

command( {
	appContext: true,
	appQuery,
	requiredArgs: 1, // TODO print proper usage example
	childEnvContext: true,
	// TODO: `requireConfirm=` with something like, 'Are you sure you want to replace your database with the contents of the provided file?',
	// Looks like requireConfirm does not work here... ("Cannot destructure property `backup` of 'undefined' or 'null'")
} ).argv( process.argv, async ( arg, opts ) => {
	const { app, env } = opts;
	const primaryDomainName = env.primaryDomain.name;
	const [ fileName ] = arg;

	console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

	if ( ! currentUserCanImportForApp( app ) ) {
		err( 'The currently authenticated account does not have permission to perform a SQL import.' );
	}

	if ( ! isSupportedApp( app ) ) {
		err( 'The type of application you specified does not currently support SQL imports.' );
	}

	await validate( fileName );

	console.log( 'You are about to import a SQL file to site:' );

	console.log( formatData( [
		{ key: 'appId', value: app.id },
		{ key: 'appName', value: app.name },
		{ key: 'environment ID', value: env.id },
		{ key: 'environment', value: env.type },
		{ key: 'Primary Domain Name', value: primaryDomainName },
	], 'keyValue' ) );

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
			// TODO: Log gqlErr.graphQLErrors
			err( `StartImport call failed: ${ gqlErr }` );
		}

		console.log( 'Your site is being prepared for the import.' );
		console.log( '🚧 🚧 🚧 Your database file is importing! 🚧 🚧 🚧\nFeel free to exit this tool if you\'d like. Your import will continue in the background.' );
	} catch ( e ) {
		err( e );
	}
} );
