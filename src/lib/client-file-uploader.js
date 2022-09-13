/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs, { ReadStream } from 'fs';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { createGzip } from 'zlib';
import { createHash } from 'crypto';
import { PassThrough } from 'stream';
import { Parser as XmlParser } from 'xml2js';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { MB_IN_BYTES } from 'lib/constants/file-size';

const debug = debugLib( 'vip:lib/client-file-uploader' );

// Files smaller than COMPRESS_THRESHOLD will not be compressed before upload
export const COMPRESS_THRESHOLD = 16 * MB_IN_BYTES;

// Files smaller than MULTIPART_THRESHOLD will use `PutObject` vs Multipart Uploads
export const MULTIPART_THRESHOLD = 32 * MB_IN_BYTES;

// This is how big each part of a Multipart Upload is (except the last / remainder)
const UPLOAD_PART_SIZE = 16 * MB_IN_BYTES;

// How many parts will upload at the same time
const MAX_CONCURRENT_PART_UPLOADS = 5;

export const getWorkingTempDir = async () =>
	new Promise( ( resolve, reject ) => {
		fs.mkdtemp( path.join( os.tmpdir(), 'vip-client-file-uploader' ), ( err, dir ) => {
			if ( err ) {
				return reject( err );
			}
			resolve( dir );
		} );
	} );

export const getFileMD5Hash = async ( fileName ) =>
	new Promise( ( resolve, reject ) =>
		fs
			.createReadStream( fileName )
			.pipe( createHash( 'md5' ).setEncoding( 'hex' ) )
			.on( 'finish', function() {
				resolve( this.read() );
			} )
			.on( 'error', error => reject( `could not generate file hash: ${ error }` ) )
	);

export const gzipFile = async ( uncompressedFileName, compressedFileName ) =>
	new Promise( ( resolve, reject ) =>
		fs
			.createReadStream( uncompressedFileName )
			.pipe( createGzip() )
			.pipe( fs.createWriteStream( compressedFileName ) )
			.on( 'finish', resolve )
			.on( 'error', error => reject( `could not compress file: ${ error }` ) )
	);

export async function getFileMeta( fileName ) {
	return new Promise( async resolve => {
		const fileSize = await getFileSize( fileName );

		const basename = path.basename( fileName );
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

export async function uploadImportSqlFileToS3( {
	app,
	env,
	fileMeta,
	progressCallback,
} ) {
	let tmpDir;
	try {
		tmpDir = await getWorkingTempDir();
	} catch ( err ) {
		throw `Unable to create temporary working directory: ${ err }`;
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

export async function uploadUsingPutObject( {
	app,
	env,
	fileMeta: { basename, fileContent, fileName, fileSize },
	progressCallback,
} ) {
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
	progressPassThrough.on( 'data', data => {
		readBytes += data.length;
		const percentage = Math.floor( ( 100 * readBytes ) / fileSize ) + '%';
		debug( percentage );
		if ( typeof progressCallback === 'function' ) {
			progressCallback( percentage );
		}
	} );

	const response = await fetch( presignedRequest.url, {
		...fetchOptions,
		body: fileContent ? fileContent : fs.createReadStream( fileName ).pipe( progressPassThrough ),
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
	} catch ( err ) {
		throw `Invalid response from cloud service. ${ err }`;
	}

	const { Code, Message } = parsedResponse.Error || {};

	throw `Unable to upload to cloud storage. ${ JSON.stringify( { Code, Message } ) }`;
}

export async function uploadUsingMultipart( {
	app,
	env,
	fileMeta,
	progressCallback,
} ) {
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

export async function getSignedUploadRequestData( {
	action,
	appId,
	basename,
	envId,
	etagResults,
	uploadId = undefined,
	partNumber = undefined,
} ) {
	const { apiFetch } = await API();
	const response = await apiFetch( '/upload/site-import-presigned-url', {
		method: 'POST',
		body: { action, appId, basename, envId, etagResults, partNumber, uploadId },
	} );

	if ( response.status !== 200 ) {
		throw ( await response.text() ) || response.statusText;
	}

	return response.json();
}

export async function checkFileAccess( fileName ) {
	return fs.promises.access( fileName, fs.R_OK );
}

export async function getFileStats( fileName ) {
	return fs.promises.stat( fileName );
}

export async function isFile( fileName ) {
	try {
		const stats = await getFileStats( fileName );
		return stats.isFile();
	} catch ( err ) {
		debug( `isFile error: ${ err }` );
		return false;
	}
}

export async function getFileSize( fileName ) {
	const stats = await getFileStats( fileName );
	return stats.size;
}

export async function detectCompressedMimeType( fileName ) {
	const ZIP_MAGIC_NUMBER = '504b0304';
	const GZ_MAGIC_NUMBER = '1f8b';

	let fileHeader = '';

	return new Promise( resolve => {
		fs.createReadStream( fileName, { start: 0, end: 8, encoding: 'hex' } )
			.on( 'data', data => {
				fileHeader += data;
			} )
			.on( 'end', () => {
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

export function getPartBoundaries( fileSize ) {
	if ( fileSize < 1 ) {
		throw 'fileSize must be greater than zero';
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

export async function uploadParts( {
	app,
	env,
	fileMeta,
	uploadId,
	parts,
	progressCallback,
} ) {
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

	const updateProgress = () => {
		const percentage = Math.floor( ( 100 * totalBytesRead ) / fileMeta.fileSize ) + '%';

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
			progressPassThrough.on( 'data', data => {
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

export async function uploadPart( {
	app,
	env,
	fileMeta: { basename, fileName },
	part,
	progressPassThrough,
	uploadId,
} ) {
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

export async function completeMultipartUpload( {
	app,
	env,
	basename,
	uploadId,
	etagResults,
} ) {
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

	const parsed = await parser.parseStringPromise( result );

	if ( parsed.Error ) {
		const { Code, Message } = parsed.Error;
		throw `Unable to complete the upload. Error: ${ JSON.stringify( { Code, Message } ) }`;
	}

	return parsed;
}
