#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import fetch from 'isomorphic-fetch';
import { Parser as XmlParser } from 'xml2js';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { currentUserCanImportForApp, isSupportedApp } from 'lib/site-import/db-file-import';
import { completeMultipartUpload, getFileMeta, getSignedUploadRequestData, hashParts, getPartBoundaries, uploadParts } from 'lib/client-file-uploader';

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

	console.log( '** Welcome to the WPVIP Site SQL Importer! **\n' );

	if ( ! currentUserCanImportForApp( app ) ) {
		err( 'The currently authenticated account does not have permission to perform a SQL import.' );
	}

	if ( ! isSupportedApp( app ) ) {
		err( 'The type of application you specified does not currently support SQL imports.' );
	}

	console.log( 'You are about to import a SQL file to site:' );
	console.log( `ID: ${ app.id }` );
	console.log( `Name: ${ app.name }` );
	console.log( `Primary Domain Name: ${ primaryDomainName }` );

	const [ fileName ] = arg;

	try {
		const fileMeta = await getFileMeta( fileName );

		const sizeInMB = fileMeta.size / 1000000;

		// TODO Validate basename
		const { basename } = fileMeta;

		console.log( `File "${ basename }" is ~ ${ Math.floor( sizeInMB ) } MB.` );
		// TODO don't do multipart for files less than 5 MB

		const presignedCreateMultipartUpload = await getSignedUploadRequestData( {
			organizationId: organization.id,
			appId: app.id,
			basename,
			action: 'CreateMultipartUpload',
		} );

		console.log( { url: presignedCreateMultipartUpload.url, method: presignedCreateMultipartUpload.options.method, headers: presignedCreateMultipartUpload.options.headers } );

		// TODO move this to the lib
		const multipartUploadResponse = await fetch( presignedCreateMultipartUpload.url, presignedCreateMultipartUpload.options );
		const multipartUploadResult = await multipartUploadResponse.text();

		console.log( { multipartUploadResult } );

		// TODO is any hardening needed here?
		const parser = new XmlParser( {
			explicitArray: false,
			ignoreAttrs: true,
		} );

		const parsedResponse = await parser.parseStringPromise( multipartUploadResult );

		if ( parsedResponse.Error ) {
			const { Code, Message } = parsedResponse.Error;
			throw `Unable to create cloud storage object. Error: ${ JSON.stringify( { Code, Message } ) }`;
		}

		if ( ! parsedResponse && parsedResponse.InitiateMultipartUploadResult && parsedResponse.InitiateMultipartUploadResult.UploadId ) {
			throw `Unable to get Upload ID from cloud storage. Error: ${ multipartUploadResult }`;
		}

		const uploadId = parsedResponse.InitiateMultipartUploadResult.UploadId;

		console.log( { uploadId } );

		const parts = getPartBoundaries( fileMeta.size );
		const partsWithHash = await hashParts( fileName, parts );
		const etagResults = await uploadParts( {
			basename,
			fileName,
			parts: partsWithHash,
			uploadId,
		} );
		console.log( { etagResults } );

		console.log( 'Completing the upload...' );
		const completeResults = await completeMultipartUpload( {
			basename,
			uploadId,
			etagResults: [
				etagResults[ 0 ], // Only one ETag object is required, don't waste bandwidth pushing them all
			],
		} );
		console.log( { completeResults } );
	} catch ( e ) {
		err( e );
	}
} );
