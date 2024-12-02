#!/usr/bin/env node

import debugLib from 'debug';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { searchAndReplace } from '../lib/search-and-replace';

const debug = debugLib( '@automattic/vip:bin:vip-search-replace' );

// Command examples
const examples = [
	// `search-replace` flag
	{
		usage: 'vip search-replace file.sql --search-replace="from,to"',
		description:
			'Search for every instance of the value "from" in the local input file named "file.sql" and replace it with the value "to".\n' +
			'       * Results of the operation output to STDOUT by default.',
	},
	// `in-place` flag
	{
		usage: 'vip search-replace file.sql --search-replace="from,to" --in-place',
		description:
			'Perform the search and replace operation on the local input file "file.sql" and overwrite the file with the results.',
	},
	// `output` flag
	{
		usage: 'vip search-replace file.sql --search-replace="from,to" --output=output-file.sql',
		description:
			'Perform the search and replace operation and save the results to a local clone of the input file named "output-file.sql".',
	},
];

command( {
	requiredArgs: 1,
} )
	.option(
		'search-replace',
		'A comma-separated pair of strings that specify the values to search for and replace (e.g. --search-replace="from,to").'
	)
	.option(
		'in-place',
		'Overwrite the local input file with the results of the search and replace operation.'
	)
	.option(
		'output',
		'The local file path used to save a copy of the results from the search and replace operation. Ignored when used with the --in-place option.'
	)
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		// TODO: tracks event for usage of this command stand alone
		const { searchReplace, inPlace, output } = opt;

		debug( 'Args: ', arg, 'searchReplace: ', searchReplace );

		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			exit.withError( 'You must pass in a filename' );
		}

		if ( ! searchReplace || ! searchReplace.length ) {
			exit.withError(
				'You must provide a pair of strings (separated by comma) such as original,replacement'
			);
		}

		const isImport = false;
		await searchAndReplace( filename, searchReplace, { isImport, inPlace, output } );
	} );
