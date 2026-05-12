import * as fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { fetch } from 'undici';

import { createProxyDispatcher } from './proxy-dispatcher';

export type OnProgressCallback = ( bytesDownloaded: number, totalBytes: number | null ) => void;

export const downloadFile = async (
	fileUrl: string,
	destinationPath: string,
	onProgress?: OnProgressCallback
): Promise< void > => {
	let response;
	const proxyDispatcher = createProxyDispatcher( fileUrl );
	try {
		response = await fetch( fileUrl, { dispatcher: proxyDispatcher ?? undefined } );
	} catch ( error ) {
		throw new Error(
			`Request to ${ fileUrl } failed: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`
		);
	}

	if ( ! response.ok ) {
		const errorMessage = `Failed to download file. Status: ${ response.status } ${ response.statusText }`;
		throw new Error( errorMessage );
	}

	if ( ! response.body ) {
		throw new Error( 'Failed to download file. The response body is empty.' );
	}

	const totalSizeHeader = response.headers.get( 'content-length' );
	const totalBytes = totalSizeHeader ? parseInt( totalSizeHeader, 10 ) : null;
	let downloadedBytes = 0;

	const fileStream = fs.createWriteStream( destinationPath );
	const nodeReadable = Readable.fromWeb( response.body );

	nodeReadable.on( 'data', ( chunk: Buffer ) => {
		downloadedBytes += chunk.length;
		if ( onProgress ) {
			onProgress( downloadedBytes, totalBytes );
		}
	} );

	try {
		nodeReadable.pipe( fileStream );
		await finished( fileStream );
	} catch ( error ) {
		try {
			await fs.promises.unlink( destinationPath );
		} catch ( unlinkErr ) {
			console.error( `Failed to delete partial file ${ destinationPath }:`, unlinkErr );
		}

		throw new Error(
			`Failed to write file to disk: ${ error instanceof Error ? error.message : 'Unknown error' }`
		);
	}
};
