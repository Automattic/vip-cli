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
	sourceDb: string | undefined;
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
	let sourceDB: string | undefined;
	let currentLineNumber = 0;

	for await ( const line of readLine ) {
		if ( line === '' ) {
			continue;
		}

		const metadataMatch = /^-- metadata.header /.exec( line );

		const sourceDBMatch = /^-- (.*)-schema-create.sql/.exec( line );
		const sourceDBName = sourceDBMatch?.[ 1 ];

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

interface MyDumperSectionSizeFixup {
	/** Byte offset in the output file where the fixed-width size field begins. */
	sizeOffset: number;
	/** Recomputed byte size of the section content; -1 until the section is closed. */
	size: number;
}

/**
 * Width of the zero-padded size placeholder we emit in section headers.
 * 20 digits fits any uint64, so the field never needs to grow when patched.
 */
const MYDUMPER_SIZE_FIELD_WIDTH = 20;

const NEWLINE = 0x0a;
/**
 * Known limitation: a *content* line that happens to look like "-- <token> <digits>" would be
 * misidentified as a section header (same assumption as the previous implementation). In
 * practice mydumper never emits such lines — string values have their newlines escaped, so
 * content cannot start a line with "-- " — and a scan of a 201k-table production dump found
 * exactly zero false matches. Tightening the filename grammar instead would risk *missing*
 * real headers (merging sections), which is strictly worse than a phantom match.
 */
const MYDUMPER_HEADER_REGEX = /^-- ([^ ]+) \d+\n$/;
// Header lines are short ("-- <filename> <size>"); anything longer is data.
const MYDUMPER_HEADER_MAX_LENGTH = 1024;

/**
 * Rewrites mydumper stream section headers ("-- <filename> <size>") with sizes recomputed
 * from the actual (post search-replace) content.
 *
 * Search-replace changes content lengths, so the original sizes become wrong. myloader uses
 * the size to tell a real section header apart from header-looking *content* inside a file:
 * while fewer bytes than the declared size have been written, a header line is treated as
 * content. The previous implementation rewrote sizes to "-1", which myloader >= 0.20 parses
 * with g_ascii_strtoull() into ULLONG_MAX — making it swallow every subsequent header as
 * content of the first section and import nothing.
 *
 * Sizes are not knowable while streaming, so this transform emits a fixed-width zero-padded
 * placeholder, counts each section's content bytes as they pass through, and records the
 * placeholder's byte offset. Callers writing to a file must call patchMyDumperSectionSizes()
 * afterwards to overwrite the placeholders in place (same byte length, so offsets are stable).
 *
 * Size convention (verified against mydumper output): a section's size counts its content
 * bytes including the content's own trailing newline, but not the single separator newline
 * that precedes the next header. The final section runs to end of stream.
 */
export class MyDumperSectionSizeTransform extends Transform {
	public readonly fixups: MyDumperSectionSizeFixup[] = [];

	private leftover: Buffer = Buffer.alloc( 0 );
	private bytesOut = 0;
	private contentStart = -1;

	public constructor() {
		super();
	}

	public _transform( chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback ) {
		const data = this.leftover.length ? Buffer.concat( [ this.leftover, chunk ] ) : chunk;
		const out: Buffer[] = [];

		let lineStart = 0;
		let newlineIndex = data.indexOf( NEWLINE, lineStart );
		while ( newlineIndex !== -1 ) {
			this.processLine( data.subarray( lineStart, newlineIndex + 1 ), out );
			lineStart = newlineIndex + 1;
			newlineIndex = data.indexOf( NEWLINE, lineStart );
		}

		// Keep the trailing partial line for the next chunk. Copy it: `data` may alias
		// the incoming chunk, whose underlying memory the stream may reuse.
		this.leftover = Buffer.from( data.subarray( lineStart ) );

		callback( null, out.length ? Buffer.concat( out ) : Buffer.alloc( 0 ) );
	}

	public _flush( callback: TransformCallback ) {
		let tail: Buffer | undefined;
		if ( this.leftover.length ) {
			tail = this.leftover;
			this.bytesOut += tail.length;
			this.leftover = Buffer.alloc( 0 );
		}

		// Close the final section: it runs to the end of the stream.
		const pending = this.fixups[ this.fixups.length - 1 ];
		if ( pending && pending.size === -1 ) {
			pending.size = this.bytesOut - this.contentStart;
		}

		callback( null, tail );
	}

	private processLine( line: Buffer, out: Buffer[] ) {
		if (
			line.length <= MYDUMPER_HEADER_MAX_LENGTH &&
			line[ 0 ] === 0x2d && // '-'
			line[ 1 ] === 0x2d && // '-'
			line[ 2 ] === 0x20 // ' '
		) {
			const match = MYDUMPER_HEADER_REGEX.exec( line.toString( 'latin1' ) );
			if ( match ) {
				// Close the previous section. Its content ends one separator newline
				// before this header.
				const pending = this.fixups[ this.fixups.length - 1 ];
				if ( pending && pending.size === -1 ) {
					pending.size = Math.max( this.bytesOut - this.contentStart - 1, 0 );
				}

				const name = match[ 1 ];
				const header = Buffer.from(
					`-- ${ name } ${ '0'.repeat( MYDUMPER_SIZE_FIELD_WIDTH ) }\n`,
					'latin1'
				);
				this.fixups.push( {
					sizeOffset: this.bytesOut + 3 + name.length + 1,
					size: -1,
				} );
				out.push( header );
				this.bytesOut += header.length;
				this.contentStart = this.bytesOut;
				return;
			}
		}

		out.push( line );
		this.bytesOut += line.length;
	}
}

/**
 * Backwards-compatible factory; see MyDumperSectionSizeTransform.
 */
export const fixMyDumperTransform = (): MyDumperSectionSizeTransform =>
	new MyDumperSectionSizeTransform();

/**
 * Overwrites the size placeholders emitted by MyDumperSectionSizeTransform with the
 * recomputed sizes. Must be called after the write stream has finished. The replacement
 * is the same byte length as the placeholder, so all recorded offsets stay valid.
 */
export async function patchMyDumperSectionSizes(
	filePath: string,
	transform: MyDumperSectionSizeTransform
): Promise< void > {
	const fileHandle = await fs.promises.open( filePath, 'r+' );
	try {
		for ( const fixup of transform.fixups ) {
			if ( fixup.size < 0 ) {
				continue;
			}
			const sizeField = String( fixup.size ).padStart( MYDUMPER_SIZE_FIELD_WIDTH, '0' );
			// eslint-disable-next-line no-await-in-loop -- intentionally sequential: positional writes on a single file handle
			await fileHandle.write( sizeField, fixup.sizeOffset, 'latin1' );
		}
	} finally {
		await fileHandle.close();
	}
}
