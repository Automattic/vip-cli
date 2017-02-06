#!/usr/bin/env node

const program = require( 'commander' );

// Ours
const api = require( '../lib/api' );

program
	.arguments( '<site> <sha>' )
	.action( ( site, sha, options ) => {
		api
			.post( '/sites/' + site + '/revisions/' + sha + '/deploy' )
			.end( err => {
				if ( err ) {
					console.error( err.response.error );
				}
			});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
