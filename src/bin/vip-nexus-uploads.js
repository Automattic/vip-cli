#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Internal dependencies
 */
import commandWrapper from 'lib/cli/command';
import Token from '../lib/token';
import { API_HOST } from 'lib/api';

const SOCKETIO_NAMESPACE = '/nexus-uploads';

/**
 * The MAX_UPLOAD_CHUNK_SIZE is provided to the `highWaterMark` on the file read stream
 * to "tweak" the chunk size for runtime and recoverability efficiency.
 *
 * In local testing, I'm seeing ~ 40% quicker uploads with 512 KiB
 * (...vs the 64 that was the default) & diminishing returns past that.
 *
 * Real-world network conditions will probably greatly differ, so we should revisit this constant.
 */
const MAX_UPLOAD_CHUNK_SIZE = 512 * 1024; // 512 KiB

// TODO: Move to a util
const getSocket = async ( namespace = '/' ) => {
	const token = await Token.get();

	return SocketIO( `${ API_HOST }${ namespace }`, {
		transportOptions: {
			polling: {
				extraHeaders: {
					Authorization: `Bearer ${ token.raw }`,
				},
			},
		},
	} );
};

const addListeners = socket => {
	socket.on( 'unauthorized', err => {
		console.log( 'There was an error with the authentication:', err.message );
	} );

	socket.on( 'cancel', message => {
		console.log( `Cancel received from server: ${ message }` );
		socket.close();
		process.exit( 1 );
	} );

	IOStream( socket ).on( 'error', err => {
		// This returns the error so it can be caught by the socket.on('error')
		// TODO: rollbar.error( err );
		return err;
	} );

	socket.on( 'error', err => {
		// TODO: rollbar.error( err );
		console.log( err );
	} );

	socket.on( 'gotChunk', message => {
		console.log( `Server says: ${ message }` );
	} );

	socket.on( 'chunkError', message => {
		console.log( `Server says: ${ message }` );
	} );

	socket.on( 'done', message => {
		console.log( `Done received from server: ${ message }` );
		socket.close();
		process.exit();
	} );
};

const getFileMeta = fileName => new Promise( async ( resolve, reject ) => {
	try {
		await fs.promises.access( fileName, fs.R_OK );
	} catch ( e ) {
		return reject( `File '${ fileName }' does not exist or is not readable` );
	}

	const { size: sizeInBytes } = await fs.promises.stat( fileName );

	if ( ! sizeInBytes ) {
		return reject( `File '${ fileName }' is empty` );
	}

	const chunkMeta = [];
	let offset = 0;
	let fileMetaReadStream;

	const wholeFileHasher = createHash( 'sha256' );

	try {
		fileMetaReadStream = fs.createReadStream( fileName, { highWaterMark: MAX_UPLOAD_CHUNK_SIZE } );
	} catch ( e ) {
		return reject( e );
	}

	fileMetaReadStream.on( 'data', chunk => {
		const chunkIndex = chunkMeta.length;
		const chunkLength = chunk.length;

		wholeFileHasher.update( chunk );

		chunkMeta.push( {
			chunkHash: createHash( 'sha256' ).update( chunk ).digest( 'hex' ),
			index: chunkIndex,
			length: chunkLength,
			start: offset,
			end: offset + chunkLength - 1,
		} );

		offset += chunk.length;
	} );

	fileMetaReadStream.on( 'end', () => {
		if ( offset !== sizeInBytes ) {
			return reject( 'Calculated size does not match stat size' );
		}

		if ( offset === 0 ) {
			return reject( 'Failed to read any bytes' );
		}

		resolve( {
			baseName: path.posix.basename( fileName ),
			hash: wholeFileHasher.digest( 'hex' ),
			sizeInBytes,
			chunkMeta,
		} );
	} );

	fileMetaReadStream.on( 'error', reject );
} );

commandWrapper( {
	requiredArgs: 1, format: true,
} )
	.argv( process.argv, async ( [ fileName ], opts ) => {
		if ( ! fileName ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		// TODO: a separate "Hello World" subcommand to emit a "ping" (ctrl + f for 'hai2u' in the Parker socketHandler)

		try {
			// Read through the input file one time to identify checksum chunks (for easier retry)
			const { baseName, sizeInBytes, chunkMeta, hash } = await getFileMeta( fileName );

			const numChunks = chunkMeta.length;
			console.log( { sizeInBytes, numChunks, hash } );

			const socket = await getSocket( SOCKETIO_NAMESPACE );
			addListeners( socket );

			// Tell the server to prepare for the upload and retrieve session data
			try {
				await new Promise( ( resolve, reject ) => {
					socket.emit( 'prepareSendFile', { baseName, sizeInBytes, hash }, response => {
						if ( response ) {
							return reject( response );
						}
						resolve();
					} );
				} );
			} catch ( prepareSendFileError ) {
				console.error( { prepareSendFileError } );
				process.exit( 1 );
			}
			console.log( 'Server is ready to receive the file' );

			const chunkUploaders = chunkMeta.map( chunkInfo => () => new Promise( ( resolve, reject ) => {
				const { end, start } = chunkInfo;

				try {
					// TODO combine into a single pipeline with the hashers
					const chunkStream = fs.createReadStream( fileName, { start, end } ).pipe( IOStream.createStream( {
						highWaterMark: MAX_UPLOAD_CHUNK_SIZE,
					} ) );
					IOStream( socket ).emit(
						'sendFileChunk',
						chunkStream,
						{ baseName, hash, numChunks, sizeInBytes, chunkInfo },
						( { error, message } ) => {
							if ( error ) {
								return reject( error );
							}
							resolve( message );
						}
					);
				} catch ( e ) {
					return reject( e );
				}
			} ) );

			console.log( `Uploading ${ sizeInBytes } bytes in ${ numChunks } chunks.` );

			for ( let i = 0; i < numChunks; i++ ) {
				try {
					// Upload the chunk
					await chunkUploaders[ i ]();

					// Show some progress
					const count = i + 1;
					const percent = Math.floor( 100 * count / numChunks );
					process.stdout.clearLine();
					process.stdout.cursorTo( 0 );
					process.stdout.write( `${ percent }% -- ${ count } of ${ numChunks } chunks` );
				} catch ( chunkUploadError ) {
					// TODO: exponential backoff & retry...throwing for now
					console.error( `Unable to upload chunk ${ i }` );
					throw chunkUploadError;
				}
			}

			console.log( '\nDone uploading. Sending checksum to the server to verify' );

			// TODO: obviously, baseName isn't enough...some compound key + uuid, maybe?
			socket.emit( 'verifyFile', { baseName }, serverCalculatedHash => {
				console.log( 'got verifyFile ack', { serverCalculatedHash } );
				if ( serverCalculatedHash !== hash ) {
					console.error( 'Server-calculated checksum does not match' );
					process.exit( 1 );
				}
				console.log( 'File was successfully uploaded and verified' );
				process.exit();
			} );
		} catch ( e ) {
			console.error( e );
			process.exit( 1 );
		}
	} );
