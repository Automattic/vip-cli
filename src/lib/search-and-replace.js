/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import debugLib from 'debug';
import { replace } from '@automattic/vip-search-replace';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import { confirm } from 'lib/cli/prompt';
import { getFileSize } from 'lib/client-file-uploader';
import * as exit from 'lib/cli/exit';

const debug = debugLib( '@automattic/vip:lib:search-and-replace' );

const flatten = arr => {
	return arr.reduce( ( flat, toFlatten ) => {
		return flat.concat( Array.isArray( toFlatten ) ? flatten( toFlatten ) : toFlatten );
	}, [] );
};

function makeTempDir() {
	const tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-search-replace-' ) );
	debug( `Created a directory to hold temporary files: ${ tmpDir }` );
	return tmpDir;
}

export function getReadAndWriteStreams( {
	fileName,
	inPlace,
	output,
} ) {
	let writeStream;
	let usingStdOut = false;
	let outputFileName;

	if ( inPlace ) {
		const midputFileName = path.join( makeTempDir(), path.basename( fileName ) );
		fs.copyFileSync( fileName, midputFileName );

		debug( `Copied input file to ${ midputFileName }` );

		debug( `Set output to the original file path ${ fileName }` );

		outputFileName = fileName;

		return {
			outputFileName,
			readStream: fs.createReadStream( midputFileName ),
			usingStdOut,
			writeStream: fs.createWriteStream( fileName ),
		};
	}

	debug( `Reading input from file: ${ fileName }` );

	switch ( typeof output ) {
		case 'string':
			writeStream = fs.createWriteStream( output );
			outputFileName = output;

			debug( `Outputting to file: ${ outputFileName }` );
			break;
		case 'object':
			writeStream = output;
			if ( writeStream === process.stdout ) {
				usingStdOut = true;
				debug( 'Outputting to the standard output stream' );
			} else {
				debug( 'Outputting to the provided output stream' );
			}
			break;
		default:
			const tmpOutFile = path.join( makeTempDir(), path.basename( fileName ) );
			writeStream = fs.createWriteStream( tmpOutFile );
			outputFileName = tmpOutFile;

			debug( `Outputting to file: ${ outputFileName }` );

			break;
	}

	return {
		outputFileName,
		readStream: fs.createReadStream( fileName ),
		usingStdOut,
		writeStream,
	};
}

export const searchAndReplace = async (
	fileName,
	pairs,
	{ isImport = true, inPlace = false, output = process.stdout },
	binary = null
) => {
	await trackEvent( 'searchreplace_started', { is_import: isImport, in_place: inPlace } );

	const startTime = process.hrtime();
	const fileSize = getFileSize( fileName );

	// if we don't have any pairs to replace with, return the input file
	if ( ! pairs || ! pairs.length ) {
		throw new Error( 'No search and replace parameters provided.' );
	}

	// If only one pair is provided, ensure we have an array
	if ( ! Array.isArray( pairs ) ) {
		pairs = [ pairs ];
	}

	// determine all the replacements required
	const replacementsArr = pairs.map( pair => pair.split( ',' ).map( str => str.trim() ) );
	const replacements = flatten( replacementsArr );
	debug( 'Pairs: ', pairs, 'Replacements: ', replacements );

	if ( inPlace ) {
		const approved = await confirm(
			[],
			'Are you sure you want to run search and replace on your input file? This operation is not reversible.'
		);

		// Bail if user does not wish to proceed
		if ( ! approved ) {
			await trackEvent( 'search_replace_in_place_cancelled', {
				is_import: isImport,
				in_place: inPlace,
			} );
			process.exit();
		}
	}

	const { usingStdOut, outputFileName, readStream, writeStream } = getReadAndWriteStreams( {
		fileName,
		inPlace,
		output,
	} );

	let replacedStream;
	try {
		replacedStream = await replace( readStream, replacements, binary );
	} catch ( replaceError ) {
		exit.withError( replaceError );
	}

	const result = await new Promise( ( resolve, reject ) => {
		replacedStream
			.pipe( writeStream )
			.on( 'finish', () => {
				resolve( {
					inputFileName: fileName,
					outputFileName,
					usingStdOut,
				} );
			} )
			.on( 'error', () => {
				console.log(
					chalk.red(
						"Oh no! We couldn't write to the output file.  Please check your available disk space and file/folder permissions."
					)
				);

				reject();
			} );
	} );

	const endTime = process.hrtime( startTime );
	const end = endTime[ 1 ] / 1000000; // time in ms

	await trackEvent( 'searchreplace_completed', { time_to_run: end, file_size: fileSize } );

	return result;
};
