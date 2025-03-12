import fs from 'node:fs';
import readline from 'node:readline';
import { Transform, TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import path from 'path';

import { createExternalizedPromise } from './promise';
import { makeTempDir } from './utils';

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

export interface MetadataDetails {
	sectionSizes: Record< string, number >;
	currentSection: string;
	currentSize: number;
}

const sectionRegex = /^-- ([^ ]+) [0-9]+$/;

const collectMetadataSizes = ( metadataDetails: MetadataDetails ) => {
	let incompleteLineBuffer = '';
	return new Transform( {
		transform( chunk: string, _encoding: BufferEncoding, callback: TransformCallback ) {
			const chunkString = chunk.toString();
			const lineEnding = chunkString.includes( '\r\n' ) ? '\r\n' : '\n';
			const lines = chunkString.split( lineEnding );
			incompleteLineBuffer += lines[ 0 ];

			// when there's no new line, it's a partial line.
			if ( lines.length === 1 ) {
				// skip processing, we can't process without a complete line.
				callback( null, chunk );
				return;
			}

			lines.forEach( ( lineParam, index ) => {
				let line = lineParam;
				if ( index === 0 ) {
					line = incompleteLineBuffer;
					incompleteLineBuffer = '';
				}
				const isLastLine = index === lines.length - 1;
				const match = line.match( sectionRegex );

				if ( isLastLine ) {
					// skip last line processing - part of this line is part of the next chunk.
					incompleteLineBuffer += line;
					return;
				}

				if ( ! match ) {
					metadataDetails.currentSize += Buffer.byteLength( line + lineEnding );
					return;
				}

				// if we find a match, then the end of the data is reached.
				const section = match[ 1 ];

				// switch over to the new section
				const previousSection = metadataDetails.currentSection;
				metadataDetails.currentSection = section;

				// and add remaining size to the previous section
				if ( previousSection ) {
					metadataDetails.sectionSizes[ previousSection ] ||= 0;
					// subtract 1 length of lineEnding because there's a newline between sections
					// that isn't included in the meta header size calculation
					metadataDetails.sectionSizes[ previousSection ] +=
						metadataDetails.currentSize - lineEnding.length;
				}
				// always reset size to 0 once we hit a new section.
				// helps account for file start padding.
				metadataDetails.currentSize = 0;
			} );
			callback( null, chunk );
		},
		flush( callback: TransformCallback ) {
			// flush any remaining size to the last section
			if ( metadataDetails.currentSection ) {
				metadataDetails.sectionSizes[ metadataDetails.currentSection ] ||= 0;
				// no extra new line for the last section
				metadataDetails.sectionSizes[ metadataDetails.currentSection ] +=
					metadataDetails.currentSize;
			}
			callback( null );
		},
	} );
};

const fixMyDumperTransform = ( metadataDetails: MetadataDetails ) => {
	let incompleteLineBuffer = '';
	return new Transform( {
		transform( chunk: string, _encoding: BufferEncoding, callback: TransformCallback ) {
			const chunkString = chunk.toString();
			const lineEnding = chunkString.includes( '\r\n' ) ? '\r\n' : '\n';
			const lines = chunkString.split( lineEnding );
			incompleteLineBuffer += lines[ 0 ];

			// when there's no new line, it's a partial line.
			if ( lines.length === 1 ) {
				// skip processing, we can't process without a complete line.
				callback( null, chunk );
				return;
			}

			const result = lines.map( ( lineParam, index ) => {
				let line = lineParam;
				if ( index === 0 ) {
					line = incompleteLineBuffer;
					incompleteLineBuffer = '';
				}
				const isLastLine = index === lines.length - 1;
				if ( isLastLine ) {
					// skip last line processing - part of this line is part of the next chunk.
					incompleteLineBuffer += line;
					// since it's part of the next chunk, don't include it in the result.
					return '';
				}

				const match = line.match( sectionRegex );

				if ( ! match ) {
					return line;
				}

				const section = match[ 1 ];
				return `-- ${ section } ${ metadataDetails.sectionSizes[ section ] }`;
			} );
			callback( null, result.join( lineEnding ) );
		},
	} );
};

export interface StreamContainer {
	streams: ( NodeJS.ReadableStream | NodeJS.ReadWriteStream | NodeJS.WritableStream )[];
}

export const mutateFixMyDumperStreamChain = async (
	filePath: string,
	streamContainer: StreamContainer
) => {
	// we do two passes, one for collecting metadata sizes,
	//  and one for applying metadata sizes.

	// Single pass is impossible for large databases, because calculating sizes
	//  require the whole content, and the content of a section can be gigabytes in size.
	//  So big database will run out of memory
	const firstPassFile = path.join(
		makeTempDir( 'mydumper-first-pass' ),
		path.basename( filePath )
	);
	const metadataDetails: MetadataDetails = {
		currentSection: '',
		currentSize: 0,
		sectionSizes: {},
	};

	streamContainer.streams.push( collectMetadataSizes( metadataDetails ) );
	streamContainer.streams.push( fs.createWriteStream( firstPassFile ) );
	await pipeline( streamContainer.streams );
	const firstPassReadStream = fs.createReadStream( firstPassFile );
	firstPassReadStream.on( 'close', () => {
		fs.rmSync( firstPassFile, {
			force: true,
		} );
	} );
	streamContainer.streams = [ firstPassReadStream, fixMyDumperTransform( metadataDetails ) ];
};
