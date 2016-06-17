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
		.command( 'api', 'Authenticated API requests' );

	program
		.command( 'db <site>' )
		.description( 'Connect to a given VIP Go database' )
		.action( site => {
			const spawn = require('child_process').spawn;

			// Get details
			api
				.get( '/sites/' + site + '/masterdb' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					var args = [
						`-h${res.body.host}`,
						`-P${res.body.port}`,
						`-u${res.body.username}`,
						`-D${res.body.name}`,
						`-p${res.body.password}`,
					];

					// Fork to mysql CLI client
					spawn( 'mysql', args, { stdio: 'inherit' } );
				});
			});

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
