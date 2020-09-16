#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { currentUserCanImportForApp, isSupportedApp } from 'lib/site-import/db-file-import';
import { uploadFile } from 'lib/client-file-uploader';
import { validate } from 'lib/validations/sql';

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
} ).argv( process.argv, async ( arg, opts ) => {
	const { app } = opts;
	const { environments, organization } = app;
	const primaryDomainName = environments[ 0 ].primaryDomain.name;
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
	console.log( `ID: ${ app.id }` );
	console.log( `Name: ${ app.name }` );
	console.log( `Primary Domain Name: ${ primaryDomainName }` );

	try {
		const results = await uploadFile( { app, fileName, organization } );
		console.log( { results } );
	} catch ( e ) {
		err( e );
	}

	// Start the import by calling the GraphQL mutation on Parker
	try {
		const result = await api
			.mutate( {
				// $FlowFixMe: gql template is not supported by flow
				mutation: gql`
					mutation StartImportMutation($input: AppEnvironmentImportInput){
						startImport(input: $input){
							environment{
								id
							}
						}
					}
				`,
				variables: {
					input: {
						id: opts.app.id,
						environmentId: opts.env.id,
					},
				},
			} );
		
		// If our mutation succeeds, log that the import is starting
		if ( result && result.success === true ) {
			console.log( 'Starting import...');
		}
	} catch ( error ) {
		if ( error.graphQLErrors ) {
			error.graphQLErrors.map( ( { message } ) => {
				console.log( chalk.red( 'Error:' ), message );
			} )
		}
	}
} );
