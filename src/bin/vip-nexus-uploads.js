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
	let countedSizeInBytes = 0;
	let offset = 0;
	let fileMetaReadStream;

	const wholeFileHasher = createHash( 'sha256' );

	try {
		/**
		 * If we want to tweak the chunk size, we do something like this:
		 * `fs.createReadStream( fileName, { highWaterMark: chunkSizeInBytes } );`
		 * I'm seeing a default of 64 KiB on my machine which seems reasonable.
		 */
		fileMetaReadStream = fs.createReadStream( fileName );
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
			offset,
		} );

		offset += chunk.length;
		countedSizeInBytes += chunk.length;
	} );

	fileMetaReadStream.on( 'end', () => {
		if ( countedSizeInBytes !== sizeInBytes ) {
			return reject( 'Calculated size does not match stat size' );
		}

		if ( countedSizeInBytes === 0 ) {
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

		// TODO: separate subcommand to "ping" the service: socket.emit( 'hai2u' ); (see Parker)

		try {
			const { baseName, sizeInBytes, chunkMeta, hash } = await getFileMeta( fileName );
			const numChunks = chunkMeta.length;
			console.log( { sizeInBytes, numChunks, hash } );

			const socket = await getSocket( SOCKETIO_NAMESPACE );
			addListeners( socket );

			// TODO Track completion of pieces

			chunkMeta.forEach( chunkInfo => {
				const start = chunkInfo.offset;
				const end = start + chunkInfo.length;
				const chunkStream = fs.createReadStream( fileName, { start, end } ).pipe( IOStream.createStream() );
				IOStream( socket ).emit( 'sendFileChunk', chunkStream, { baseName, hash, numChunks, sizeInBytes, chunkInfo } );
			} );
		} catch ( e ) {
			console.error( e );
			process.exit( 1 );
		}
	} );
