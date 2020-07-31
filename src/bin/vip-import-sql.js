#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { permissionCheck, supportedAppCheck } from 'lib/site-import/db-file-import';
import { getUploadURL } from 'lib/client-file-uploader';

const appQuery = 'id, name, organization { id, name },environments{ id, appId, type, name, primaryDomain { name } }';

command( {
	appContext: true,
	appQuery,
} ).argv( process.argv, async ( arg, opts ) => {
	const { app } = opts;
	const { environments, organization } = app;
	const primaryDomainName = environments[ 0 ].primaryDomain.name;

	console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

	try {
		supportedAppCheck( app );
		permissionCheck( app );
	} catch ( preCheckError ) {
		console.error( `Import Error: ${ preCheckError }` );
		return 1;
	}

	console.log( 'You are about to import a SQL file to site:' );
	console.log( `ID: ${ app.id }` );
	console.log( `Name: ${ app.name }` );
	console.log( `Primary Domain Name: ${ primaryDomainName }` );

	try {
		const uploadURL = await getUploadURL( organization.id, app.id, 'omgwtfbbq.sql' );
		console.log( await uploadURL.text() );
	} catch ( e ) {
		console.error( `Error getting upload URL: ${ e }` );
		return 1;
	}
} );
