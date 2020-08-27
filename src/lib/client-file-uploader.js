/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import os from 'os';
import path, { sep as pathSeparator } from 'path';
import fetch from 'isomorphic-fetch';
import { createGzip } from 'zlib';
import { createHash } from 'crypto';
import { PassThrough } from 'stream';
import { Parser as XmlParser } from 'xml2js';
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { MB_IN_BYTES } from 'lib/constants/file-size';

// Files smaller than MULTIPART_THRESHOLD will use `PutObject` vs Multipart Uploads
export const MULTIPART_THRESHOLD = 32 * MB_IN_BYTES;

// This is how big each part of a Multipart Upload is (except the last / remainder)
const UPLOAD_PART_SIZE = 16 * MB_IN_BYTES;

// How many parts will upload at the same time
const MAX_CONCURRENT_PART_UPLOADS = 5;

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

export const getWorkingTempDir = async () =>
	new Promise( ( resolve, reject ) => {
		fs.mkdtemp( path.join( os.tmpdir(), 'vip-client-file-uploader' ), 'utf8', ( err, dir ) => {
			if ( err ) {
				return reject( err );
			}
			resolve( dir );
		} );
	} );

export type UploadArguments = {
	app: Object,
	fileName: string,
	organization: Object,
};

export const getFileMD5Hash = async ( fileName: string ) =>
	new Promise( resolve =>
		fs
			.createReadStream( fileName, { encoding: 'hex', highWaterMark: UPLOAD_PART_SIZE } )
			.pipe( createHash( 'md5' ).setEncoding( 'hex' ) )
			.on( 'finish', function() {
				resolve( this.read() );
			} )
	);

export const gzipFile = async ( uncompressedFileName: string, compressedFileName: string ) =>
	new Promise( resolve =>
		fs
			.createReadStream( uncompressedFileName )
			.pipe( createGzip() )
			.pipe( fs.createWriteStream( compressedFileName ) )
			.on( 'finish', resolve )
	);

// TODO improve naming a bit to include "presigned"
export async function uploadFile( { app, fileName, organization }: UploadArguments ) {
	const fileMeta = await getFileMeta( fileName );

	let tmpDir;
	try {
		tmpDir = await getWorkingTempDir();
	} catch ( e ) {
		throw `Unable to create temporary working directory: ${ e }`;
	}

	console.log(
		`File "${ fileMeta.basename }" is ~ ${ Math.floor( fileMeta.fileSize / MB_IN_BYTES ) } MB.`
	);

	if ( ! fileMeta.isCompressed ) {
		// Compress to the temp dir & annotate `fileMeta`
		const uncompressedFileName = fileMeta.fileName;
		const uncompressedFileSize = fileMeta.fileSize;
		fileMeta.basename = fileMeta.basename.replace( /(.gz)?$/i, '.gz' );
		fileMeta.fileName = `${ tmpDir }${ pathSeparator }${ fileMeta.basename }`;

		console.log( `Compressing to ${ fileMeta.fileName } prior to transfer.` );

		await gzipFile( uncompressedFileName, fileMeta.fileName );
		fileMeta.isCompressed = true;
		fileMeta.fileSize = await getFileSize( fileMeta.fileName );

		console.log( `Compressed file is ~ ${ Math.floor( fileMeta.fileSize / MB_IN_BYTES ) } MB.` );

		const fewerBytes = uncompressedFileSize - fileMeta.fileSize;
		console.log(
			`Compression resulted in a ${ ( fewerBytes / MB_IN_BYTES ).toFixed( 2 ) }MB (${ Math.floor(
				( 100 * fewerBytes ) / uncompressedFileSize
			) }%) smaller file`
		);
	}

	try {
		fileMeta.md5 = await getFileMD5Hash( fileMeta.fileName );
		console.log( `Calculated file md5 hash: ${ fileMeta.md5 }` );
	} catch ( e ) {
		throw `Unable to calculate file checksum: ${ e }`;
	}

	// TODO write md5 to temp dir & upload that as well

	// TODO try and merge the two `uploadUsing` functions
	return fileMeta.fileSize < MULTIPART_THRESHOLD
		? uploadUsingPutObject( { app, fileMeta, organization } )
		: uploadUsingMultipart( { app, fileMeta, organization } );
}

export type FileMeta = {
	basename: string,
	md5?: string,
	fileName: string,
	fileSize: number,
	isCompressed: boolean,
};

export type UploadUsingArguments = {
	app: Object,
	fileMeta: FileMeta,
	organization: Object,
};

export async function uploadUsingPutObject( {
	app,
	fileMeta: { basename, fileName, fileSize },
	organization,
}: UploadUsingArguments ) {
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
		'Content-Length': `${ fileSize }`, // This has to be a string
	};

	let readBytes = 0;
	const progressPassThrough = new PassThrough();
	progressPassThrough.on( 'data', data => {
		readBytes += data.length;
		singleLogLine( `${ Math.floor( ( 100 * readBytes ) / fileSize ) }%...` );
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
	fileMeta,
	organization,
}: UploadUsingArguments ) {
	const { basename, fileName } = fileMeta;

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

	const parts = getPartBoundaries( fileMeta.fileSize );
	const partsWithHash = await hashParts( fileName, parts );
	const etagResults = await uploadParts( {
		fileMeta,
		parts: partsWithHash,
		uploadId,
	} );
	console.log( { etagResults } );

	/**
	 * Processing of a Complete Multipart Upload request could take several minutes to complete.
	 * After Amazon S3 begins processing the request, it sends an HTTP response header that specifies a 200 OK response.
	 * While processing is in progress, Amazon S3 periodically sends white space characters to keep the connection from timing out.
	 * Because a request could fail after the initial 200 OK response has been sent, it is important that you check the
	 * response body to determine whether the request succeeded.
	 * Note that if CompleteMultipartUpload fails, applications should be prepared to retry the failed requests.
	 *
	 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html
	 */
	return completeMultipartUpload( {
		basename,
		uploadId,
		etagResults,
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

export async function detectCompressedMimeType( fileName: string ): Promise<string | void> {
	const ZIP_MAGIC_NUMBER = '504b0304';
	const GZ_MAGIC_NUMBER = '1f8b';

	let fileHeader = '';

	return new Promise( resolve => {
		fs.createReadStream( fileName, { start: 0, end: 8, encoding: 'hex' } )
			.on( 'data', data => {
				fileHeader += data;
			} )
			.on( 'end', () => {
				console.log( { fileHeader } );
				if ( ZIP_MAGIC_NUMBER === fileHeader.slice( 0, ZIP_MAGIC_NUMBER.length ) ) {
					return resolve( 'application/zip' );
				}
				if ( GZ_MAGIC_NUMBER === fileHeader.slice( 0, GZ_MAGIC_NUMBER.length ) ) {
					return resolve( 'application/gzip' );
				}
				resolve();
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

		const fileSize = await getFileSize( fileName );

		if ( ! fileSize ) {
			return reject( `File '${ fileName }' is empty.` );
		}

		const basename = path.posix.basename( fileName );
		// TODO Validate File basename...  encodeURIComponent, maybe...?

		const mimeType = await detectCompressedMimeType( fileName );
		// TODO Only allow a subset of Mime Types...?

		const isCompressed = [ 'application/zip', 'application/gzip' ].includes( mimeType );

		resolve( {
			basename,
			fileName,
			fileSize,
			isCompressed,
		} );
	} );
}

export type PartBoundaries = {
	end: number,
	index: number,
	partSize: number,
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
		const partSize = end + 1 - start;
		return { end, index, partSize, start };
	} );
}

// TODO: Pull this out...try to use the Content-MD5 header instead
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
	fileMeta: FileMeta,
	uploadId: string,
	parts: Array<any>,
};

export async function uploadParts( { fileMeta, uploadId, parts }: UploadPartsArgs ) {
	let uploadsInProgress = 0;
	let totalBytesRead = 0;
	const partPercentages = new Array( parts.length ).fill( 0 );

	const readyForPartUpload = () =>
		new Promise( resolve => {
			const canDoInterval = setInterval( () => {
				if ( uploadsInProgress < MAX_CONCURRENT_PART_UPLOADS ) {
					uploadsInProgress++;
					clearInterval( canDoInterval );
					resolve();
				}
			}, 300 );
		} );

	const printProgress = () =>
		singleLogLine(
			partPercentages
				.map( ( partPercentage, index ) => {
					const { partSize } = parts[ index ];
					return `Part # ${ index }: ${ partPercentage }% of ${ ( partSize / MB_IN_BYTES ).toFixed(
						2
					) }MB`;
				} )
				.join( '\n' ) +
				`\n\nOverall Progress: ${ Math.floor(
					( 100 * totalBytesRead ) / fileMeta.fileSize
				) }% of ${ ( fileMeta.fileSize / MB_IN_BYTES ).toFixed( 2 ) }MB`
		);
	const printProgressInterval = setInterval( printProgress, 500 );

	const allDone = await Promise.all(
		parts.map( async part => {
			const { index, partSize } = part;
			const progressPassThrough = new PassThrough();

			let partBytesRead = 0;
			progressPassThrough.on( 'data', data => {
				totalBytesRead += data.length;
				partBytesRead += data.length;
				partPercentages[ index ] = Math.floor( ( 100 * partBytesRead ) / partSize );
			} );

			await readyForPartUpload();

			const uploadResult = await uploadPart( {
				fileMeta,
				part,
				progressPassThrough,
				uploadId,
			} );

			uploadsInProgress--;

			return uploadResult;
		} )
	);

	clearInterval( printProgressInterval );
	printProgress();

	return allDone;
}

export type UploadPartArgs = {
	fileMeta: FileMeta,
	part: Object,
	progressPassThrough: PassThrough,
	uploadId: string,
};
export async function uploadPart( {
	fileMeta: { basename, fileName },
	part,
	progressPassThrough,
	uploadId,
}: UploadPartArgs ) {
	const { end, index, partSize, start } = part;
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
			'Content-Length': `${ partSize }`, // This has to be a string
			/**
			 * TODO? 'Content-MD5': Buffer.from( ... ).toString( 'base64' ),
			 * Content-MD5 has to be base64 encoded.
			 * It's the hash of the entire request object & has to be included in the signature,
			 *   ...so it may not be feasible to include with presigned requests.
			 */
		};

		fetchOptions.body = fs.createReadStream( fileName, { start, end } ).pipe( progressPassThrough );

		const fetchResponse = await fetch( partUploadRequestData.url, fetchOptions );
		if ( fetchResponse.status === 200 ) {
			const responseHeaders = fetchResponse.headers.raw();
			const [ etag ] = responseHeaders.etag;
			return JSON.parse( etag );
		}

		const result = await fetchResponse.text();

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
