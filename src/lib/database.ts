import fs from 'fs';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import readline from 'readline';
import yauzl, { Entry } from 'yauzl';
import zlib from 'zlib';

const yauzlOpenP: ( path: string, options: yauzl.Options ) => Promise< yauzl.ZipFile > = promisify(
	yauzl.open
);

export const isMyDumperFile = async ( filePath: string ) => {
	const isCompressed = filePath.endsWith( '.gz' ) || filePath.endsWith( '.zip' );
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

const getSqlFileStreamFromZip = async ( filePath: string ): Promise< Readable > => {
	await verifyFileExists( filePath );
	let promiseResolver: ( readable: Readable ) => void = null as unknown as (
		readable: Readable
	) => void;
	let promiseRejector: ( err: Error ) => void = null as unknown as ( err: Error ) => void;
	const promise = new Promise< Readable >( ( resolve, reject ) => {
		promiseResolver = resolve;
		promiseRejector = reject;
	} );
	let zipFile: yauzl.ZipFile = null as unknown as yauzl.ZipFile;

	try {
		zipFile = await yauzlOpenP( filePath, {
			lazyEntries: true,
			autoClose: false,
		} );
	} catch ( err ) {
		if ( promiseRejector ) {
			promiseRejector( err as Error );
		}
	}

	let sqlFileFound = false;

	let errorFound = false;

	zipFile.on( 'entry', ( async ( entry: Entry ) => {
		if ( entry.fileName.endsWith( '.sql' ) ) {
			try {
				const readStream = await promisify( zipFile.openReadStream.bind( zipFile ) )( entry );
				sqlFileFound = true;
				promiseResolver( readStream );
			} catch ( err ) {
				errorFound = true;
				promiseRejector( err as Error );
			}
			zipFile.close();
			return;
		}
		zipFile.readEntry();
	} ) as unknown as () => void );

	zipFile.once( 'end', () => {
		zipFile.close();
	} );

	zipFile.on( 'close', () => {
		if ( errorFound ) {
			return;
		}
		if ( ! sqlFileFound ) {
			promiseRejector( new Error( 'SQL file not found' ) );
		}
	} );

	return await promise;
};

const getSqlFileStreamFromCompressedFile = async ( filePath: string ): Promise< Readable > => {
	if ( filePath.endsWith( '.gz' ) ) {
		return await getSqlFileStreamFromGz( filePath );
	} else if ( filePath.endsWith( '.zip' ) ) {
		return await getSqlFileStreamFromZip( filePath );
	}

	throw new Error( 'Not a supported compressed file' );
};
