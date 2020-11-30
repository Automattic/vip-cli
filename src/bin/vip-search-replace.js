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
	.argv( process.argv, async ( arg, opt ) => {

		const pairs = opt.pair;
		debug( 'Args: ', arg, 'Pairs: ', pairs );

		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		if ( ! pairs || ! pairs.length ) {
			console.error( 'You must provide a pair of strings (separated by comma) such as original,replacement' );
			process.exit( 1 );
		}

		const isImport = false;
		searchAndReplace( filename, pairs, isImport );
	} );
