#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { searchAndReplace } from 'lib/search-and-replace';

const debug = debugLib( '@automattic/vip:bin:vip-search-replace' );

command( {
	requiredArgs: 1,
} )
	.example( 'vip search replace <file> --pair=<from,to>', 'Replace instances of <from> with <to> in the provided <file>' )
	.option( 'pair', 'Specify the <from> and <to> pairs to be replaced' )
	.option( 'in-place', 'Perform the search and replace explicitly on the input file' )
	.argv( process.argv, async ( arg, opt ) => {
		const { pair, inPlace } = opt;

		debug( 'Args: ', arg, 'Pair: ', pair );

		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		if ( ! pair || ! pair.length ) {
			console.error( 'You must provide a pair of strings (separated by comma) such as original,replacement' );
			process.exit( 1 );
		}

		const isImport = false;
		await searchAndReplace( filename, pair, { isImport, inPlace } );
	} );
