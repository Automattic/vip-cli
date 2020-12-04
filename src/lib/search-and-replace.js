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
import util from 'util';
import chalk from 'chalk';
import debugLib from 'debug';
import suffix from 'suffix';
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

const inPlaceReplacement = async filename => {
	await confirm( [], 'Are you sure you want to run search and replace on your input file? This operation is not reversible.' );

	const tmpFilePath = path.join( os.tmpdir(), ( +new Date ).toString( 36 ) );

	const copyFile = util.promisify( fs.copyFile );
	await copyFile( filename, tmpFilePath );

	return {
		inputFile: tmpFilePath,
		outputFile: filename,
	};
};

const outputFileReplacement = filename => {
	return {
		inputFile: filename,
		outputFile: suffix( filename, '.out' ),
	};
};

export type searchReplaceOptions = {
	isImport: boolean,
	inPlace: boolean,
};

export const searchAndReplace = async ( filename: string, pairs: Array<String> | String, { isImport = true, inPlace = false }: searchReplaceOptions ): Promise<string> => {
	await trackEvent( 'vip_cli_searchreplace_started', { isImport, inPlace } );

	const startTime = process.hrtime();
	const fileSize = getFileSize( filename );

	// if we don't have any pairs to replace with, return the input file
	if ( ! pairs || ! pairs.length ) {
		console.log( chalk.blueBright( 'No search and replace parameters provided.' ) );
		return filename;
	}

	// If only one pair is provided, ensure we have an array
	if ( ! Array.isArray( pairs ) ) {
		pairs = [ pairs ];
	}

	// determine all the replacements required
	const replacementsArr = pairs
		.map( str => str.split( ',' ) );
	const replacements = flatten( replacementsArr );
	debug( 'Pairs: ', pairs, 'Replacements: ', replacements );

	// Get a path for a tmp copy of the input file
	const { inputFile, outputFile } = inPlace ? await inPlaceReplacement( filename ) : outputFileReplacement( filename );

	console.log( chalk.blueBright( 'Input File Path: ' ), inputFile );
	console.log( chalk.blueBright( 'Output File Path: ' ), outputFile );

	const readStream = fs.createReadStream( inputFile, { encoding: 'utf8' } );
	const writeStream = fs.createWriteStream( outputFile, { encoding: 'utf8' } );

	const replacedStream = await replace( readStream, replacements );
	const result = await new Promise( ( resolve, reject ) => {
		replacedStream
			.pipe( writeStream )
			.on( 'finish', () => {
				console.log( chalk.green( 'Search and Replace Complete!' ) );
				resolve( outputFile );
			} )
			.on( 'error', () => {
				console.log( chalk.red( 'Oh no! We could not write to the output file.' ) );
				reject();
			} );
	} );

	const endTime = process.hrtime( startTime );
	const end = endTime[ 1 ] / 1000000; // time in ms

	await trackEvent( 'vip_cli_searchreplace_completed', { timeToRun: end, fileSize } );

	return result;
};
