/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import fetch from 'isomorphic-fetch';
import { createHash } from 'crypto';
import { PassThrough } from 'stream';
import { Parser as XmlParser } from 'xml2js';
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const KILOBYTE_IN_BYTES = 1024;
const MEGABYTE_IN_BYTES = KILOBYTE_IN_BYTES * 1024;

// Files smaller than MULTIPART_THRESHOLD will use `PutObject` vs Multipart Uploads
export const MULTIPART_THRESHOLD = 32 * MEGABYTE_IN_BYTES;
const UPLOAD_PART_SIZE = 5 * MEGABYTE_IN_BYTES;

export interface GetSignedUploadRequestDataArgs {
	action: | 'AbortMultipartUpload'
		| 'CreateMultipartUpload'
		| 'CompleteMultipartUpload'
		| 'ListParts'
		| 'PutObject'
		| 'UploadPart';
	etagResults?: Array<Object>;
	organizationId?: number;
	appId?: number;
	basename: string;
	partNumber?: number;
	uploadId?: string;
}

export type UploadArguments = {
	app: Object,
	basename: string,
	fileMeta: Object,
	fileName: string,
	organization: Object,
};

// TODO improve naming a bit to include "presigned"
export async function uploadFile( {
	app,
	basename,
	fileMeta,
	fileName,
	organization,
}: UploadArguments ) {
	return fileMeta.size < MULTIPART_THRESHOLD
		? uploadUsingPutObject( { app, basename, fileMeta, fileName, organization } )
		: uploadUsingMultipart( { app, basename, fileMeta, fileName, organization } );
}

export async function uploadUsingPutObject( {
	app,
	basename,
	fileMeta,
	fileName,
	organization,
}: UploadArguments ) {
	console.log( 'Uploading to S3 using the `PutObject` command.' );

	const presignedRequest = await getSignedUploadRequestData( {
		organizationId: organization.id,
		appId: app.id,
		basename,
		action: 'PutObject',
	} );

	const fetchOptions = presignedRequest.options;
	fetchOptions.headers = {
		...fetchOptions.headers,
		'Content-Length': `${ fileMeta.size }`, // This has to be a string
	};

	let readBytes = 0;
	const progressPassThrough = new PassThrough();
	progressPassThrough.on( 'data', data => {
		readBytes += data.length;
		singleLogLine( `${ Math.floor( ( 100 * readBytes ) / fileMeta.size ) }%...` );
	} );
	progressPassThrough.on( 'end', () => console.log( '\n' ) );

	const readStream = fs.createReadStream( fileName ).pipe( progressPassThrough );

	const response = await fetch( presignedRequest.url, {
		...fetchOptions,
		body: readStream,
	} );

	if ( response.status === 200 ) {
		return 'ok';
	}

	const result = await response.text();

	// TODO is any additional hardening needed here?
	const parser = new XmlParser( {
		explicitArray: false,
		ignoreAttrs: true,
	} );

	let parsedResponse;
	try {
		parsedResponse = await parser.parseStringPromise( result );
	} catch ( e ) {
		throw `Invalid response from cloud service. ${ e }`;
	}

	const { Code, Message } = parsedResponse.Error || {};
	throw `Unable to upload to cloud storage. ${ JSON.stringify( { Code, Message } ) }`;
}

export async function uploadUsingMultipart( {
	app,
	basename,
	fileMeta,
	fileName,
	organization,
}: UploadArguments ) {
	console.log( 'Uploading to S3 using the Multipart API.' );

	const presignedCreateMultipartUpload = await getSignedUploadRequestData( {
		organizationId: organization.id,
		appId: app.id,
		basename,
		action: 'CreateMultipartUpload',
	} );

	const multipartUploadResponse = await fetch(
		presignedCreateMultipartUpload.url,
		presignedCreateMultipartUpload.options
	);
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

	if (
		! parsedResponse &&
		parsedResponse.InitiateMultipartUploadResult &&
		parsedResponse.InitiateMultipartUploadResult.UploadId
	) {
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
	return completeMultipartUpload( {
		basename,
		uploadId,
		etagResults: [
			etagResults[ 0 ], // Only one ETag object is required, don't waste bandwidth pushing them all
		],
	} );
}

export async function getSignedUploadRequestData( {
	organizationId,
	appId,
	basename,
	action,
	etagResults,
	uploadId = undefined,
	partNumber = undefined,
}: GetSignedUploadRequestDataArgs ): Promise<Object> {
	const { apiFetch } = await API();
	const response = await apiFetch( '/upload/signed-url', {
		method: 'POST',
		body: { action, appId, basename, etagResults, organizationId, partNumber, uploadId },
	} );

	if ( response.status !== 200 ) {
		throw await response.text();
	}

	return response.json();
}

export type FileMeta = {
	basename: string,
	md5: string,
	fileName: string,
	size: number,
};

export async function checkFileAccess( fileName: string ): Promise<void> {
	// Node 8 doesn't have fs.promises, so fall back to this
	return new Promise( ( resolve, reject ) => {
		fs.access( fileName, fs.R_OK, err => {
			if ( err ) {
				reject( err );
			}
			resolve();
		} );
	} );
}

export async function getFileSize( fileName: string ): Promise<number> {
	// Node 8 doesn't have fs.promises, so fall back to this
	return new Promise( ( resolve, reject ) => {
		fs.stat( fileName, ( err, stats ) => {
			if ( err ) {
				reject( err );
			}
			resolve( stats.size );
		} );
	} );
}

export function getFileMeta( fileName: string ): Promise<FileMeta> {
	return new Promise( async ( resolve, reject ) => {
		try {
			await checkFileAccess( fileName );
		} catch ( e ) {
			return reject( `File '${ fileName }' does not exist or is not readable.` );
		}

		const size = await getFileSize( fileName );

		if ( ! size ) {
			return reject( `File '${ fileName }' is empty.` );
		}

		try {
			fs.createReadStream( fileName, { highWaterMark: UPLOAD_PART_SIZE } )
				.pipe( createHash( 'md5' ).setEncoding( 'hex' ) )
				.on( 'finish', function() {
					resolve( {
						basename: path.posix.basename( fileName ),
						fileName,
						size,
						md5: this.read(),
					} );
				} );
		} catch ( e ) {
			return reject( e );
		}
	} );
}

export type PartBoundaries = {
	end: number,
	index: number,
	size: number,
	start: number,
};
export function getPartBoundaries( fileSize: number ): Array<PartBoundaries> {
	if ( fileSize < 1 ) {
		throw 'fileSize must be greater than zero';
	}

	const numParts = Math.ceil( fileSize / UPLOAD_PART_SIZE );

	return new Array( numParts ).fill( undefined ).map( ( _, index ) => {
		const start = index * UPLOAD_PART_SIZE;
		const remaining = fileSize - start;
		const end = ( remaining > UPLOAD_PART_SIZE ? start + UPLOAD_PART_SIZE : start + remaining ) - 1;
		const size = end + 1 - start;
		return { end, index, size, start };
	} );
}

export async function hashParts( fileName: string, parts: Array<PartBoundaries> ) {
	return Promise.all(
		parts.map(
			part =>
				new Promise( resolve => {
					const { start, end } = part;
					const hasher = createHash( 'md5' ).setEncoding( 'hex' );
					fs.createReadStream( fileName, { start, end } )
						.pipe( hasher )
						.on( 'finish', () => {
							hasher.end();
							return resolve( {
								...part,
								md5: hasher.read(),
							} );
						} );
				} )
		)
	);
}

type UploadPartsArgs = {
	basename: string,
	fileName: string,
	uploadId: string,
	parts: Array<any>,
};

export async function uploadParts( { basename, fileName, uploadId, parts }: UploadPartsArgs ) {
	// TODO limit concurrency
	return Promise.all( parts.map( part => uploadPart( { basename, fileName, uploadId, part } ) ) );
}

export type UploadPartArgs = {
	basename: string,
	fileName: string,
	part: Object,
	uploadId: string,
};
export async function uploadPart( { basename, fileName, part, uploadId }: UploadPartArgs ) {
	console.log( { part } );
	const { end, index, size, start } = part;
	const s3PartNumber = index + 1; // S3 multipart is indexed from 1

	// TODO: handle failures / retries, etc.
	const doUpload = async () => {
		// Get the signed request data from Parker
		const partUploadRequestData = await getSignedUploadRequestData( {
			action: 'UploadPart',
			// TODO use org & app IDs to derive bucket information
			// TODO: organizationId: organization.id,
			// TODO: appId: app.id,
			basename,
			partNumber: s3PartNumber,
			uploadId,
		} );
		const fetchOptions = partUploadRequestData.options;
		fetchOptions.headers = {
			...fetchOptions.headers,
			'Content-Length': `${ size }`, // This has to be a string
			/**
			 * TODO? 'Content-MD5': Buffer.from( ... ).toString( 'base64' ),
			 * Content-MD5 has to be base64 encoded.
			 * It's the hash of the entire request object & has to be included in the signature,
			 *   ...so it may not be feasible to include with presigned requests.
			 */
		};

		fetchOptions.body = fs.createReadStream( fileName, { start, end } );

		console.log( `Uploading Part #${ s3PartNumber }` );

		const fetchResponse = await fetch( partUploadRequestData.url, fetchOptions );
		if ( fetchResponse.status === 200 ) {
			const responseHeaders = fetchResponse.headers.raw();
			console.log( { responseHeaders } );
			const [ etag ] = responseHeaders.etag;
			return JSON.parse( etag );
		}

		const result = await fetchResponse.text();
		console.log( [ partUploadRequestData.url, fetchOptions, result ] );

		// TODO is any hardening needed here?
		const parser = new XmlParser( {
			explicitArray: false,
			ignoreAttrs: true,
		} );

		const parsed = await parser.parseStringPromise( result );

		if ( parsed.Error ) {
			const { Code, Message } = parsed.Error;
			throw `Unable to upload file part. Error: ${ JSON.stringify( { Code, Message } ) }`;
		}

		return parsed;
	};

	return {
		ETag: await doUpload(),
		PartNumber: s3PartNumber,
	};
}

export type CompleteMultipartUploadArgs = {
	basename: string,
	uploadId: string,
	etagResults: Array<any>,
};

export async function completeMultipartUpload( {
	basename,
	uploadId,
	etagResults,
}: CompleteMultipartUploadArgs ) {
	const completeMultipartUploadRequestData = await getSignedUploadRequestData( {
		action: 'CompleteMultipartUpload',
		basename,
		uploadId,
		etagResults,
	} );

	const completeMultipartUploadResponse = await fetch(
		completeMultipartUploadRequestData.url,
		completeMultipartUploadRequestData.options
	);

	if ( completeMultipartUploadResponse.status !== 200 ) {
		throw await completeMultipartUploadResponse.text();
	}

	const result = await completeMultipartUploadResponse.text();

	const parser = new XmlParser( {
		explicitArray: false,
		ignoreAttrs: true,
	} );

	const parsed = await parser.parseStringPromise( result );

	if ( parsed.Error ) {
		const { Code, Message } = parsed.Error;
		throw `Unable to complete the upload. Error: ${ JSON.stringify( { Code, Message } ) }`;
	}

	return parsed;
}
