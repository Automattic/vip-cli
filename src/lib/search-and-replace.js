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
import { stdout as log } from 'single-line-log';
import debugLib from 'debug';
import { replace } from '@automattic/vip-search-replace';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';

const debug = debugLib( '@automattic/vip:lib:search-and-replace' );

const flatten = arr => {
	return arr.reduce( function( flat, toFlatten ) {
		return flat.concat( Array.isArray( toFlatten ) ? flatten( toFlatten ) : toFlatten );
	}, [] );
};

export const searchAndReplace = async ( filename: string, pairs: Array<String>, isImport: boolean = true ) => {
	// If only one pair is provided, ensure we have an array
	if ( ! Array.isArray( pairs ) ) {
		pairs = [ pairs ];
	}

	const replacementsArr = pairs
		.map( str => str.split( ',' ) );

	const replacements = flatten( replacementsArr );

	debug( 'Pairs: ', pairs, 'Replacements: ', replacements );

	// Get a path for a tmp copy of the input file
	const tmpFilePath = path.join( os.tmpdir(), ( +new Date ).toString( 36 ) );

	const copyFile = util.promisify( fs.copyFile );
	await copyFile( filename, tmpFilePath );
	debug( 'Filename: ', filename );
	debug( 'Temp file created: ', fs.existsSync( tmpFilePath ) );
	debug( 'Temp file path: ', tmpFilePath );

	const readStream = fs.createReadStream( tmpFilePath, { encoding: 'utf8' } );
	const writeStream = fs.createWriteStream( filename, { encoding: 'utf8' } );

	// ReadStream.on( 'data', chunk => debug( chunk ) );

	const replacedStream = await replace( readStream, replacements );

	replacedStream
		.pipe( writeStream )
		.on( 'finish', function() { // Finished
			if ( ! isImport ) {
				console.log( chalk.green( 'Search and Replace Complete!' ) );
			}
		} );
};
