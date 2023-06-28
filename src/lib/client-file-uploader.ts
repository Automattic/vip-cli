// @format

/**
 * External dependencies
 */
import { constants, createReadStream, createWriteStream, type ReadStream } from 'fs';
import { access, mkdtemp, open, stat } from 'node:fs/promises';
import os from 'os';
import path from 'path';
import fetch, { HeaderInit, RequestInit } from 'node-fetch';
import chalk from 'chalk';
import { createGunzip, createGzip } from 'zlib';
import { createHash } from 'crypto';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'stream';
import { Parser as XmlParser } from 'xml2js';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import http from '../lib/api/http';
import { MB_IN_BYTES } from '../lib/constants/file-size';

const debug = debugLib( 'vip:lib/client-file-uploader' );

// Files smaller than COMPRESS_THRESHOLD will not be compressed before upload
export const COMPRESS_THRESHOLD = 16 * MB_IN_BYTES;

// Files smaller than MULTIPART_THRESHOLD will use `PutObject` vs Multipart Uploads
export const MULTIPART_THRESHOLD = 32 * MB_IN_BYTES;

// This is how big each part of a Multipart Upload is (except the last / remainder)
const UPLOAD_PART_SIZE = 16 * MB_IN_BYTES;

// How many parts will upload at the same time
const MAX_CONCURRENT_PART_UPLOADS = 5;

// TODO: Replace with a proper definitions once we convert lib/cli/command.js to TypeScript
interface WithId {
	id: number;
}

interface FileMeta {
	basename: string;
	fileContent?: string | Buffer | ReadStream;
	fileName: string;
	fileSize: number;
	isCompressed: boolean;
}

export interface GetSignedUploadRequestDataArgs {
	action:
		| 'AbortMultipartUpload'
		| 'CreateMultipartUpload'
		| 'CompleteMultipartUpload'
		| 'ListParts'
		| 'PutObject'
		| 'UploadPart';
	etagResults?: Object[];
	appId: number;
	envId: number;
	basename: string;
	partNumber?: number;
	uploadId?: string;
}

const getWorkingTempDir = (): Promise< string > =>
	mkdtemp( path.join( os.tmpdir(), 'vip-client-file-uploader' ) );

interface UploadArguments {
	app: WithId;
	env: WithId;
	fileMeta: FileMeta;
	progressCallback?: Function;
}

export const getFileMD5Hash = async ( fileName: string ): Promise< string > => {
	const src = createReadStream( fileName );
	const dst = createHash( 'md5' );
	try {
		await pipeline( src, dst );
		return dst.digest().toString( 'hex' );
	} catch ( err ) {
		throw new Error( `could not generate file hash: ${ ( err as Error ).message }` );
	}
};

const gzipFile = async ( uncompressedFileName: string, compressedFileName: string ) => {
	try {
		await pipeline(
			createReadStream( uncompressedFileName ),
			createGzip(),
			createWriteStream( compressedFileName )
		);
	} catch ( err ) {
		throw new Error( `could not compress file: ${ ( err as Error ).message }` );
	}
};

/**
 * Extract a .gz file and save it to a specified location
 *
 * @param {string} inputFilename  The file to unzip
 * @param {string} outputFilename The file where the unzipped data will be written
 * @return {Promise} A promise that resolves when the file is unzipped
 */
export const unzipFile = async (
	inputFilename: string,
	outputFilename: string
): Promise< void > => {
	const source = createReadStream( inputFilename );
	const destination = createWriteStream( outputFilename );
	await pipeline( source, createGunzip(), destination );
};

export async function getFileMeta( fileName: string ): Promise< FileMeta > {
	const fileSize = await getFileSize( fileName );

	const basename = path.basename( fileName );
	// TODO Validate File basename...  encodeURIComponent, maybe...?

	const mimeType = await detectCompressedMimeType( fileName );
	// TODO Only allow a subset of Mime Types...?

	const isCompressed = [ 'application/zip', 'application/gzip' ].includes( mimeType );

	return {
		basename,
		fileName,
		fileSize,
		isCompressed,
	};
}

export async function uploadImportSqlFileToS3( {
	app,
	env,
	fileMeta,
	progressCallback,
}: UploadArguments ) {
	let tmpDir;
	try {
		tmpDir = await getWorkingTempDir();
	} catch ( err ) {
		throw new Error(
			`Unable to create temporary working directory: ${ ( err as Error ).message }`
		);
	}

	debug(
		`File ${ chalk.cyan( fileMeta.basename ) } is ~ ${ Math.floor(
			fileMeta.fileSize / MB_IN_BYTES
		) } MB\n`
	);

	// TODO Compression will probably fail over a certain file size... break into pieces...?
	// TODO if needed add a flag to bypass auto-compression

	if ( ! fileMeta.isCompressed && fileMeta.fileSize >= COMPRESS_THRESHOLD ) {
		// Compress to the temp dir & annotate `fileMeta`
		const uncompressedFileName = fileMeta.fileName;
		const uncompressedFileSize = fileMeta.fileSize;
		fileMeta.basename = fileMeta.basename.replace( /(.gz)?$/i, '.gz' );
		fileMeta.fileName = path.join( tmpDir, fileMeta.basename );

		debug( `Compressing the file to ${ chalk.cyan( fileMeta.fileName ) } prior to transfer...` );

		await gzipFile( uncompressedFileName, fileMeta.fileName );
		fileMeta.isCompressed = true;
		fileMeta.fileSize = await getFileSize( fileMeta.fileName );

		debug( `Compressed file is ~ ${ Math.floor( fileMeta.fileSize / MB_IN_BYTES ) } MB\n` );

		const fewerBytes = uncompressedFileSize - fileMeta.fileSize;

		const calculation = `${ ( fewerBytes / MB_IN_BYTES ).toFixed( 2 ) }MB (${ Math.floor(
			( 100 * fewerBytes ) / uncompressedFileSize
		) }%)`;

		debug( `** Compression resulted in a ${ calculation } smaller file 📦 **\n` );
	}

	debug( 'Calculating file md5 checksum...' );
	const md5 = await getFileMD5Hash( fileMeta.fileName );
	debug( `Calculated file md5 checksum: ${ md5 }\n` );

	const result =
		fileMeta.fileSize < MULTIPART_THRESHOLD
			? await uploadUsingPutObject( { app, env, fileMeta, progressCallback } )
			: await uploadUsingMultipart( { app, env, fileMeta, progressCallback } );

	return {
		fileMeta,
		md5,
		result,
	};
}

interface UploadUsingArguments {
	app: WithId;
	env: WithId;
	fileMeta: FileMeta;
	progressCallback?: Function;
}

interface PresignedRequest {
	options: {
		headers: HeaderInit;
	};
	url: string;
}

/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html#API_CompleteMultipartUpload_Example_3
 */
interface UploadErrorResponse {
	Error: {
		Code: string;
		Message: string;
		RequestId: string;
		HostId: string;
	};
}

async function uploadUsingPutObject( {
	app,
	env,
	fileMeta: { basename, fileContent, fileName, fileSize },
	progressCallback,
}: UploadUsingArguments ): Promise< string > {
	debug( `Uploading ${ chalk.cyan( basename ) } to S3 using the \`PutObject\` command` );

	const presignedRequest = await getSignedUploadRequestData( {
		appId: app.id,
		envId: env.id,
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
	progressPassThrough.on( 'data', ( data: Buffer | string ) => {
		readBytes += data.length;
		const percentage = `${ Math.floor( ( 100 * readBytes ) / fileSize ) }%`;
		debug( percentage );
		if ( typeof progressCallback === 'function' ) {
			progressCallback( percentage );
		}
	} );

	const response = await fetch( presignedRequest.url, {
		...fetchOptions,
		body: fileContent ? fileContent : createReadStream( fileName ).pipe( progressPassThrough ),
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
		parsedResponse = ( await parser.parseStringPromise( result ) ) as UploadErrorResponse;
	} catch ( err ) {
		throw new Error( `Invalid response from cloud service. ${ ( err as Error ).message }` );
	}

	const { Code, Message } = parsedResponse.Error;

	throw new Error( `Unable to upload to cloud storage. ${ JSON.stringify( { Code, Message } ) }` );
}

/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateMultipartUpload.html#API_CreateMultipartUpload_ResponseSyntax
 */
interface CreateMultipartUploadResponse {
	InitiateMultipartUploadResult: {
		Bucket: string;
		Key: string;
		UploadId: string;
	};
}

type CreateMultipartUploadResult = CreateMultipartUploadResponse | UploadErrorResponse;

async function uploadUsingMultipart( {
	app,
	env,
	fileMeta,
	progressCallback,
}: UploadUsingArguments ) {
	const { basename } = fileMeta;

	debug( `Uploading ${ chalk.cyan( basename ) } to S3 using the Multipart API.` );

	const presignedCreateMultipartUpload = await getSignedUploadRequestData( {
		appId: app.id,
		envId: env.id,
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

	const parsedResponse = ( await parser.parseStringPromise(
		multipartUploadResult
	) ) as CreateMultipartUploadResult;

	if ( 'Error' in parsedResponse ) {
		const { Code, Message } = parsedResponse.Error;
		throw new Error(
			`Unable to create cloud storage object. Error: ${ JSON.stringify( { Code, Message } ) }`
		);
	}

	if (
		! ( 'InitiateMultipartUploadResult' in parsedResponse ) ||
		! parsedResponse.InitiateMultipartUploadResult.UploadId
	) {
		throw new Error(
			`Unable to get Upload ID from cloud storage. Error: ${ multipartUploadResult }`
		);
	}

	const uploadId = parsedResponse.InitiateMultipartUploadResult.UploadId;

	debug( { uploadId } );

	const parts = getPartBoundaries( fileMeta.fileSize );
	const etagResults = await uploadParts( {
		app,
		env,
		fileMeta,
		parts,
		uploadId,
		progressCallback,
	} );
	debug( { etagResults } );

	return completeMultipartUpload( {
		app,
		env,
		basename,
		uploadId,
		etagResults,
	} );
}

async function getSignedUploadRequestData( {
	action,
	appId,
	basename,
	envId,
	etagResults,
	uploadId = undefined,
	partNumber = undefined,
}: GetSignedUploadRequestDataArgs ): Promise< PresignedRequest > {
	const response = await http( '/upload/site-import-presigned-url', {
		method: 'POST',
		body: { action, appId, basename, envId, etagResults, partNumber, uploadId },
	} );

	if ( response.status !== 200 ) {
		throw new Error( ( await response.text() ) || response.statusText );
	}

	return response.json() as Promise< PresignedRequest >;
}

export async function checkFileAccess( fileName: string ): Promise< void > {
	return access( fileName, constants.R_OK );
}

export async function isFile( fileName: string ): Promise< boolean > {
	try {
		const stats = await stat( fileName );
		return stats.isFile();
	} catch ( err ) {
		debug( `isFile error: ${ ( err as Error ).message }` );
		return false;
	}
}

export async function getFileSize( fileName: string ): Promise< number > {
	const stats = await stat( fileName );
	return stats.size;
}

export async function detectCompressedMimeType( fileName: string ): Promise< string > {
	const ZIP_MAGIC_NUMBER = '504b0304';
	const GZ_MAGIC_NUMBER = '1f8b';

	const file = await open( fileName, 'r' );
	const { buffer } = await file.read( Buffer.alloc( 4 ), 0, 4, 0 );
	const fileHeader = buffer.toString( 'hex' );

	if ( ZIP_MAGIC_NUMBER === fileHeader.slice( 0, ZIP_MAGIC_NUMBER.length ) ) {
		return 'application/zip';
	}

	if ( GZ_MAGIC_NUMBER === fileHeader.slice( 0, GZ_MAGIC_NUMBER.length ) ) {
		return 'application/gzip';
	}

	return '';
}

export interface PartBoundaries {
	end: number;
	index: number;
	partSize: number;
	start: number;
}
export function getPartBoundaries( fileSize: number ): PartBoundaries[] {
	if ( fileSize < 1 ) {
		throw new Error( 'fileSize must be greater than zero' );
	}

	const numParts = Math.ceil( fileSize / UPLOAD_PART_SIZE );

	return new Array( numParts ).fill( undefined ).map( ( _numPart, index ) => {
		const start = index * UPLOAD_PART_SIZE;
		const remaining = fileSize - start;
		const end = ( remaining > UPLOAD_PART_SIZE ? start + UPLOAD_PART_SIZE : start + remaining ) - 1;
		const partSize = end + 1 - start;
		return { end, index, partSize, start };
	} );
}

interface Part {
	start: number;
	end: number;
	index: number;
	partSize: number;
}

interface UploadPartsArgs {
	app: WithId;
	env: WithId;
	fileMeta: FileMeta;
	uploadId: string;
	parts: Part[];
	progressCallback?: Function;
}

export async function uploadParts( {
	app,
	env,
	fileMeta,
	uploadId,
	parts,
	progressCallback,
}: UploadPartsArgs ) {
	let uploadsInProgress = 0;
	let totalBytesRead = 0;
	const partPercentages = new Array< number >( parts.length ).fill( 0 );

	const readyForPartUpload = () =>
		new Promise< void >( resolve => {
			const canDoInterval = setInterval( () => {
				if ( uploadsInProgress < MAX_CONCURRENT_PART_UPLOADS ) {
					uploadsInProgress++;
					clearInterval( canDoInterval );
					resolve();
				}
			}, 300 );
		} );

	const updateProgress = () => {
		const percentage = `${ Math.floor( ( 100 * totalBytesRead ) / fileMeta.fileSize ) }%`;

		if ( typeof progressCallback === 'function' ) {
			progressCallback( percentage );
		}

		debug(
			partPercentages
				.map( ( partPercentage, index ) => {
					const { partSize } = parts[ index ];
					return `Part # ${ index }: ${ partPercentage }% of ${ ( partSize / MB_IN_BYTES ).toFixed(
						2
					) }MB`;
				} )
				.join( '\n' ) +
				`\n\nOverall Progress: ${ percentage }% of ${ ( fileMeta.fileSize / MB_IN_BYTES ).toFixed(
					2
				) }MB`
		);
	};
	const updateProgressInterval = setInterval( updateProgress, 500 );

	const allDone = await Promise.all(
		parts.map( async part => {
			const { index, partSize } = part;
			const progressPassThrough = new PassThrough();

			let partBytesRead = 0;
			progressPassThrough.on( 'data', ( data: Buffer | string ) => {
				totalBytesRead += data.length;
				partBytesRead += data.length;
				partPercentages[ index ] = Math.floor( ( 100 * partBytesRead ) / partSize );
			} );

			await readyForPartUpload();

			const uploadResult = await uploadPart( {
				app,
				env,
				fileMeta,
				part,
				progressPassThrough,
				uploadId,
			} );

			uploadsInProgress--;

			return uploadResult;
		} )
	);

	clearInterval( updateProgressInterval );
	updateProgress();

	return allDone;
}

export interface UploadPartArgs {
	app: WithId;
	env: WithId;
	fileMeta: FileMeta;
	part: Part;
	progressPassThrough: PassThrough;
	uploadId: string;
}
async function uploadPart( {
	app,
	env,
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
			appId: app.id,
			envId: env.id,
			basename,
			partNumber: s3PartNumber,
			uploadId,
		} );
		const fetchOptions: RequestInit = partUploadRequestData.options;
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

		fetchOptions.body = createReadStream( fileName, { start, end } ).pipe( progressPassThrough );

		const fetchResponse = await fetch( partUploadRequestData.url, fetchOptions );
		if ( fetchResponse.status === 200 ) {
			const responseHeaders = fetchResponse.headers.raw();
			const [ etag ] = responseHeaders.etag;
			return JSON.parse( etag ) as string;
		}

		const result = await fetchResponse.text();

		// TODO is any hardening needed here?
		const parser = new XmlParser( {
			explicitArray: false,
			ignoreAttrs: true,
		} );

		const parsed = ( await parser.parseStringPromise( result ) ) as UploadErrorResponse;
		const { Code, Message } = parsed.Error;
		throw new Error(
			`Unable to upload file part. Error: ${ JSON.stringify( { Code, Message } ) }`
		);
	};

	return {
		ETag: await doUpload(),
		PartNumber: s3PartNumber,
	};
}

export interface CompleteMultipartUploadArgs {
	app: WithId;
	env: WithId;
	basename: string;
	uploadId: string;
	etagResults: Object[];
}

/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html#API_CompleteMultipartUpload_ResponseSyntax
 */
interface CompleteMultipartUploadResponse {
	CompleteMultipartUploadResult: {
		Location: string;
		Bucket: string;
		Key: string;
		ETag: string;
		ChecksumCRC32: string;
		ChecksumCRC32C: string;
		ChecksumSHA1: string;
		ChecksumSHA256: string;
	};
}

type CompleteMultipartUploadResult = CompleteMultipartUploadResponse | UploadErrorResponse;

async function completeMultipartUpload( {
	app,
	env,
	basename,
	uploadId,
	etagResults,
}: CompleteMultipartUploadArgs ): Promise< CompleteMultipartUploadResponse > {
	const completeMultipartUploadRequestData = await getSignedUploadRequestData( {
		action: 'CompleteMultipartUpload',
		appId: app.id,
		envId: env.id,
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
	const result = await completeMultipartUploadResponse.text();

	const parser = new XmlParser( {
		explicitArray: false,
		ignoreAttrs: true,
	} );

	const parsed = ( await parser.parseStringPromise( result ) ) as CompleteMultipartUploadResult;

	if ( 'Error' in parsed ) {
		const { Code, Message } = parsed.Error;
		throw new Error(
			`Unable to complete the upload. Error: ${ JSON.stringify( { Code, Message } ) }`
		);
	}

	return parsed;
}
