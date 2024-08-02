import fs from 'node:fs';
import readline from 'node:readline';
import { Transform, TransformCallback } from 'node:stream';
import zlib from 'node:zlib';

import { createExternalizedPromise } from './promise';

export enum SqlDumpType {
	MYDUMPER = 'MYDUMPER',
	MYSQLDUMP = 'MYSQLDUMP',
}

export interface SqlDumpDetails {
	type: SqlDumpType;
	sourceDb: string;
}

export const getSqlDumpDetails = async ( filePath: string ): Promise< SqlDumpDetails > => {
	const isCompressed = filePath.endsWith( '.gz' );
	let fileStream: fs.ReadStream | zlib.Gunzip;
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	const fileStreamExternalPromise = createExternalizedPromise< void >();

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
	let sourceDB = '';
	let currentLineNumber = 0;

	for await ( const line of readLine ) {
		if ( line === '' ) {
			continue;
		}

		const metadataMatch = line.match( /^-- metadata.header / );

		const sourceDBMatch = line.match( /^-- (.*)-schema-create.sql/ ) ?? [];
		const sourceDBName = sourceDBMatch[ 1 ];

		if ( metadataMatch && ! isMyDumper ) {
			isMyDumper = true;
		}

		if ( sourceDBMatch && ! sourceDB ) {
			sourceDB = sourceDBName;
		}

		if ( sourceDB && isMyDumper ) {
			// all fields found? end the search early.
			break;
		}

		if ( currentLineNumber > 100 ) {
			// we'll assume that this isn't the correct file if we still haven't found `-- metadata.header` even at the 100th line.
			break;
		}

		currentLineNumber++;
	}

	if ( fileStream instanceof fs.ReadStream ) {
		fileStream.on( 'close', () => {
			fileStreamExternalPromise.resolve();
		} );
	} else {
		fileStreamExternalPromise.resolve();
	}

	readLine.close();
	fileStream.close();
	await fileStreamExternalPromise.promise;

	return {
		type: isMyDumper ? SqlDumpType.MYDUMPER : SqlDumpType.MYSQLDUMP,
		sourceDb: sourceDB,
	};
};

const verifyFileExists = async ( filePath: string ) => {
	try {
		await fs.promises.access( filePath, fs.constants.F_OK );
	} catch {
		throw new Error( 'File not accessible. Does file exist?' );
	}
};

const getSqlFileStreamFromGz = async ( filePath: string ): Promise< zlib.Gunzip > => {
	await verifyFileExists( filePath );
	return fs.createReadStream( filePath ).pipe( zlib.createGunzip() );
};

const getSqlFileStreamFromCompressedFile = async ( filePath: string ): Promise< zlib.Gunzip > => {
	if ( filePath.endsWith( '.gz' ) ) {
		return await getSqlFileStreamFromGz( filePath );
	}

	throw new Error( 'Not a supported compressed file' );
};

export const fixMyDumperTransform = () => {
	return new Transform( {
		transform( chunk: string, _encoding: BufferEncoding, callback: TransformCallback ) {
			const chunkString = chunk.toString();
			const lineEnding = chunkString.includes( '\r\n' ) ? '\r\n' : '\n';
			const regex = /^-- ([^ ]+) [0-9]+$/;
			const lines = chunk
				.toString()
				.split( lineEnding )
				.map( line => {
					const match = line.match( regex );

					if ( ! match ) {
						return line;
					}

					const tablePart = match[ 1 ];
					return `-- ${ tablePart } -1`;
				} );
			callback( null, lines.join( lineEnding ) );
		},
	} );
};
