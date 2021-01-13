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

const debug = debugLib( '@automattic/vip:lib:search-and-replace' );

const flatten = arr => {
	return arr.reduce( function( flat, toFlatten ) {
		return flat.concat( Array.isArray( toFlatten ) ? flatten( toFlatten ) : toFlatten );
	}, [] );
};

export type GetReadAndWriteStreamsOptions = {
	fileName: string,
	inPlace: boolean,
	output: boolean | string | Buffer | stream$Writable,
};

export type GetReadAndWriteStreamsOutput = {
	outputFileName?: string,
	readStream: stream$Readable | Buffer,
	usingStdOut: boolean,
	writeStream: stream$Writable | Buffer,
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
}: GetReadAndWriteStreamsOptions ): GetReadAndWriteStreamsOutput {
	let writeStream;
	let usingStdOut = false;
	let outputFileName;

	if ( inPlace ) {
		const midputFileName = path.join( makeTempDir(), path.basename( fileName ) );
		fs.copyFileSync( fileName, midputFileName );

		debug( `Copied input file to ${ midputFileName }` );
		console.log( chalk.green( `Copied input file to ${ midputFileName }` ) );

		debug( `Set output to the original file path ${ fileName }` );
		console.log( chalk.green( `Set output to the original file path ${ fileName }` ) );
		return {
			outputFileName,
			readStream: fs.createReadStream( midputFileName, { encoding: 'utf8' } ),
			usingStdOut,
			writeStream: fs.createWriteStream( fileName, { encoding: 'utf8' } ),
		};
	}

	debug( `Reading input from file: ${ fileName }` );
	console.log( `Searching file ${ chalk.cyan( fileName ) }` );

	switch ( typeof output ) {
		case 'string':
			writeStream = fs.createWriteStream( output, { encoding: 'utf8' } );
			outputFileName = output;
			debug( `Outputting to file: ${ outputFileName }` );
			console.log( 'Replacing...' );
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
			writeStream = fs.createWriteStream( tmpOutFile, {
				encoding: 'utf8',
			} );
			outputFileName = tmpOutFile;

			debug( `Outputting to file: ${ outputFileName }` );
			console.log( 'Replacing...' );

			break;
	}

	return {
		outputFileName,
		readStream: fs.createReadStream( fileName, { encoding: 'utf8' } ),
		usingStdOut,
		writeStream,
	};
}

export type SearchReplaceOptions = {
	isImport: boolean,
	inPlace: boolean,
	output: boolean | string | Buffer | stream$Writable,
};

export type SearchReplaceOutput = {
	inputFileName: string,
	outputFileName?: string,
	usingStdOut: boolean,
};

export const searchAndReplace = async (
	fileName: string,
	pairs: Array<String> | String,
	{ isImport = true, inPlace = false, output = process.stdout }: SearchReplaceOptions,
	binary: string | null = null
): Promise<SearchReplaceOutput> => {
	console.log( `${ 'Starting Search and Replace...' }` );

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
	const replacementsArr = pairs.map( str => str.split( ',' ) );
	const replacements = flatten( replacementsArr );
	debug( 'Pairs: ', pairs, 'Replacements: ', replacements );

	// Add a confirmation step for search-replace
	const yes = await confirm( [
		{
			key: 'from',
			value: `${ chalk.cyan( replacements[ 0 ] ) }`,
		},
		{
			key: 'to',
			value: `${ chalk.cyan( replacements[ 1 ] ) }`,
		},
	], 'Proceed with the following Search and Replace values?' );

	// Bail if user does not wish to proceed
	if ( ! yes ) {
		console.log( `${ chalk.red( 'Cancelling' ) }` );

		await trackEvent( 'search_replace_cancelled', { is_import: isImport, in_place: inPlace } );

		process.exit();
	}

	if ( inPlace ) {
		await confirm(
			[],
			'Are you sure you want to run search and replace on your input file? This operation is not reversible.'
		);
	}

	const { usingStdOut, outputFileName, readStream, writeStream } = getReadAndWriteStreams( {
		fileName,
		inPlace,
		output,
	} );

	const replacedStream = await replace( readStream, replacements, binary );
	const result = await new Promise( ( resolve, reject ) => {
		replacedStream
			.pipe( writeStream )
			.on( 'finish', () => {
				if ( ! usingStdOut ) {
					console.log();
					console.log( `${ 'Search and Replace Complete!' }` );
					console.log();
				}
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
