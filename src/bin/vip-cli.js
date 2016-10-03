#!/usr/bin/env node

const program = require('commander');
const spawn = require('child_process').spawn;

// Ours
const api = require('../lib/api');
const utils = require('../lib/utils');

program
	.arguments( '<site> [command...]' )
	.action( ( site, command, options ) => {

		// Preemptively query for sites, so we can pass the ID
		// down and avoid duplicate API requests
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			getSandboxForSite( site, ( err, sandbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sandbox ) {
					return createSandboxForSite( site, ( err, sandbox ) => {
						if ( err ) {
							return console.error( err );
						}

						runCommand( sandbox, command );
					});
				}

				runCommand( sandbox, command );
			});
		});
	});

function runCommand( container, command, cb ) {
	var run = [
		'exec',
		'-it', container.container_name,
		'env', 'TERM=xterm',
	];

	if ( command.length < 1 ) {
		run.push( 'bash' );
	} else {
		run = run.concat( command );

		// TODO: Define this in wp-cli.yml
		if ( "wp" == command[0] ) {
			run.push( '--path=/var/www' );
		}
	}

	// TODO: Handle file references as arguments
	spawn( 'docker', run, { stdio: 'inherit' } );
}

function createSandboxForSite( site, cb ) {
	api
		.post( '/sandboxes' )
		.send({ 'client_site_id': site.client_site_id })
		.end( ( err, res ) => {
			// Poll for sandbox
			var poll = setInterval( () => {
				getSandboxForSite( site, ( err, sandbox ) => {
					if ( err ) {
						// API error, bail
						clearInterval( poll );
						return cb( err );
					}

					if ( ! sandbox ) {
						return console.log( 'Waiting for sandbox container to start...' );
					}

					clearInterval( poll );
					cb( err, sandbox );
				});
			}, 1000 );
		});
}

function getSandboxForSite( site, cb ) {
	api
		.get( '/sandboxes' )
		.query({
			'api_user_id': api.auth.apiUserId,
			'client_site_id': site.client_site_id,
		})
		.end( ( err, res ) => {
			if ( err ) {
				return cb( err );
			}

			var data = res.body.data;

			if ( ! data || ! data[0] ) {
				return cb( null );
			}

			return cb( null, data[0].containers[0] );
		});
}

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
