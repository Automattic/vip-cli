#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

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
	.example( 'vip search replace <file> --search-replace=<from,to>', 'Replace instances of <from> with <to> in the provided <file>' )
	.option( 'search-replace', 'Specify the <from> and <to> pairs to be replaced' )
	.option( 'in-place', 'Perform the search and replace explicitly on the input file' )
	.option( 'output', 'Where should the replacement file be written? Has no effect when `in-place` is true. Default: process.stdout' )
	.argv( process.argv, async ( arg, opt ) => {
		// TODO: tracks event for usage of this command stand alone
		const { searchReplace, inPlace, output } = opt;

		debug( 'Args: ', arg, 'searchReplace: ', searchReplace );

		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		if ( ! searchReplace || ! searchReplace.length ) {
			console.error( 'You must provide a pair of strings (separated by comma) such as original,replacement' );
			process.exit( 1 );
		}

		const isImport = false;
		await searchAndReplace( filename, searchReplace, { isImport, inPlace, output } );
	} );
