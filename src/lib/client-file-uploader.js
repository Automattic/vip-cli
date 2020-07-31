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
import { Parser as XmlParser } from 'xml2js';

/**
 * Internal dependencies
 */
import API from 'lib/api';

// Files smaller than UPLOAD_PART_SIZE will use PutObject vs Multipart Uploads
const UPLOAD_PART_SIZE = 5242880; // 5 Megabytes in Bytes (5 * 1024 * 1024)

export interface GetSignedUploadRequestDataArgs {
	action: | 'AbortMultipartUpload'
		| 'CreateMultipartUpload'
		| 'CompleteMultipartUpload'
		| 'ListParts'
		| 'ListMultipartUploads'
		| 'UploadPart';
	organizationId?: number;
	appId?: number;
	basename: string;
	partNumber?: number;
	uploadId?: string;
}

export async function getSignedUploadRequestData( {
	organizationId,
	appId,
	basename,
	action,
	uploadId = undefined,
	partNumber = undefined,
}: GetSignedUploadRequestDataArgs ): Promise<Object> {
	const { apiFetch } = await API();
	const response = await apiFetch( '/upload/signed-url', {
		method: 'POST',
		body: { action, appId, basename, organizationId, partNumber, uploadId },
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

export function getFileMeta( fileName: string ): Promise<FileMeta> {
	return new Promise( async ( resolve, reject ) => {
		try {
			await fs.promises.access( fileName, fs.R_OK );
		} catch ( e ) {
			return reject( `File '${ fileName }' does not exist or is not readable` );
		}

		const { size } = await fs.promises.stat( fileName );

		if ( ! size ) {
			return reject( `File '${ fileName }' is empty` );
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
			// 'Content-MD5': Buffer.from( md5 ).toString( 'base64' ), // This has to be base64 encoded
			//	'Content-Type': 'applicaton/octet-stream',
		};

		fetchOptions.body = fs.createReadStream( fileName, { start, end } );

		console.log( `Uploading Part #${ s3PartNumber }` );

		const fetchResult = await fetch( partUploadRequestData.url, fetchOptions );
		if ( fetchResult.status === 200 ) {
			const responseHeaders = fetchResult.headers.raw();
			console.log( { responseHeaders } );
			const [ etag ] = responseHeaders.etag;
			return JSON.parse( etag );
		}

		const response = await fetchResult.text();
		console.log( [ partUploadRequestData.url, fetchOptions, response ] );

		// TODO is any hardening needed here?
		const parser = new XmlParser( {
			explicitArray: false,
			ignoreAttrs: true,
		} );

		const parsed = await parser.parseStringPromise( response );

		if ( parsed.Error ) {
			const { Code, Message } = parsed.Error;
			throw `Unable to upload file part. Error: ${ JSON.stringify( { Code, Message } ) }`;
		}

		return parsed;
	};

	return {
		index,
		etag: await doUpload(),
		s3PartNumber,
	};
}

export function completeMultipartUpload( { uploadId, parts } ) {
	// TODO
	// Action: CompleteMultipartUpload
}
