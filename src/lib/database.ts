import fs from 'fs';
import { Readable } from 'node:stream';
import readline from 'readline';
import zlib from 'zlib';

export const isMyDumperFile = async ( filePath: string ) => {
	const isCompressed = filePath.endsWith( '.gz' );
	let fileStream: Readable;

	if ( isCompressed ) {
		fileStream = await getSqlFileStreamFromCompressedFile( filePath );
	} else {
		fileStream = fs.createReadStream( filePath );
	}

	const readLine = readline.createInterface( {
		input: fileStream,
		crlfDelay: Infinity,
	} );

	let isMyDumper = false;
	let currentLineNumber = 0;

	for await ( const line of readLine ) {
		if ( line === '' ) {
			continue;
		}

		if ( line.match( /^-- metadata.header / ) ) {
			isMyDumper = true;
			break;
		}

		if ( currentLineNumber > 10 ) {
			// we'll assume that this isn't the correct file if we still haven't found `-- metadata.header` even at the 10th line.
			break;
		}
		currentLineNumber++;
	}

	return isMyDumper;
};

const verifyFileExists = async ( filePath: string ) => {
	try {
		await fs.promises.access( filePath, fs.constants.F_OK );
	} catch {
		throw new Error( 'File not accessible. Does file exists?' );
	}
};

const getSqlFileStreamFromGz = async ( filePath: string ): Promise< Readable > => {
	await verifyFileExists( filePath );
	return fs.createReadStream( filePath ).pipe( zlib.createGunzip() );
};

const getSqlFileStreamFromCompressedFile = async ( filePath: string ): Promise< Readable > => {
	if ( filePath.endsWith( '.gz' ) ) {
		return await getSqlFileStreamFromGz( filePath );
	}

	throw new Error( 'Not a supported compressed file' );
};
