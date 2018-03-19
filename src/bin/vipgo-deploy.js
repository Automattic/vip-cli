#!/usr/bin/env node

const program = require( 'commander' );

// Ours
const api = require( '../lib/api' );
const utils = require( '../lib/utils' );

program
	.arguments( '<site> <sha>' )
	.action( ( site, sha, options ) => {

		if ( sha.length < 7 || ! sha.match( /^[0-9a-f]+$/i ) ) {
			return console.error( 'Deploy sha must be at least 7 hexadecimal digits.' );
		}

		utils.findSite( site, ( err, site ) => {
			if ( err || ! site ) {
				return console.error( 'Could not find specified site' );
			}

			api
				.post( '/sites/' + site.client_site_id + '/revisions/' + sha + '/deploy' )
				.end( err => {
					if ( err ) {
						console.error( err.response.error );
					}

					console.log( 'Success: Queued deploy for %s', site.primary_domain.domain_name );
				});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
