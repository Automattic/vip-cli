#! /usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

var program = require( 'commander' );

program
	.version( '0.0.1' )
	.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
