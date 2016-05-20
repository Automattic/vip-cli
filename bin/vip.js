#! /usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

var program = require( 'commander' );
var package = require( '../package.json' );

program
	.version( package.version )
	.command( 'configure', 'configure the cli settings' )
	.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
