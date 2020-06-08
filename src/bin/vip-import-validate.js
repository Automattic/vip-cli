#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
const readline = require( 'readline' );
const fs = require( 'fs' );

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 1, format: true,
} )
	.argv( process.argv, async ( arg, opts ) => {
		if ( ! arg && ! arg[ 0 ] ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		const readInterface = readline.createInterface( {
			input: fs.createReadStream( arg[ 0 ] ),
			output: null,
			console: false,
		} );

		let dropTableCount = 0;
		let siteUrlMatches = [];

		readInterface.on( 'line', function( line ) {
			if ( line.match( 'CREATE TABLE (`)?([a-z0-9_]*)\\1\\s' ) ) {
				dropTableCount += 1;
			}

			const homeMatch = line.match( '\'(siteurl|home)\',\\s?\'(.*?)\'' );
			if ( homeMatch ) {
				siteUrlMatches = siteUrlMatches.concat( homeMatch[ 0 ] );
			}
		} );

		readInterface.on( 'close', function() {
			console.log( `CREATE Table Count: ${ dropTableCount }` );
			console.log( 'siteurl|home matches: ', siteUrlMatches );
		} );
	} );
