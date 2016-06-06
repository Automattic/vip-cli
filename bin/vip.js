#! /usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

var program = require( 'commander' );
var package = require( '../package.json' );
var api = require( '../src/api' );

// TODO
var is_vip = true;

program
	.version( package.version )
	.command( 'configure', 'configure the cli settings' )

// internal VIP commands
if (!!is_vip) {
	program
		.command( 'deploy <site> <sha>' )
		.description( 'deploy given git SHA')
		.action( (site, sha) => {
			// TODO: Make sha optional, deploy latest
			// TODO: Take domain name for site

			api
				.post('/sites/' + site + '/revisions/' + sha + '/deploy' )
				.end( err => {
					if (err) {
						console.error(err.response.error)
					}
				})
		})
}

program.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
