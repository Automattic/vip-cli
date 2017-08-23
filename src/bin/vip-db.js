#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );
const which = require( 'which' );

// Ours
const api = require( '../lib/api' );
const db = require( '../lib/db' );
const utils = require( '../lib/utils' );
const siteUtils   = require( '../lib/site' );

program
	.arguments( '<site>' )
	.action( ( site, options ) => {
		try {
			which.sync( 'mysql' );
		} catch ( e ) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		utils.findSite( site, ( err, s ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! s ) {
				return console.error( "Couldn't find site:", site );
			}

			if ( ! require( 'tty' ).isatty( 1 ) ) {
				console.log( '-- Site:', s.client_site_id );
				console.log( '-- Domain:', s.domain_name );
				console.log( '-- Environment:', s.environment_name );
				return db.exportDB( s, err => {
					if ( err ) {
						return console.error( err );
					}
				});
			}

			var ays = s.environment_name === 'production' ? 'This is the database for PRODUCTION. Are you sure? (y/n)' : 'Are you sure? (y/n)';

			utils.displayNotice( [
				'Connecting to database:',
				`-- Site: ${ s.domain_name } (#${ s.client_site_id })`,
				'-- Environment: ' + s.environment_name,
			] );

			promptly.confirm( ays, ( err, t ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! t ) {
					return;
				}

				return db.getCLI( s, err => {
					if ( err ) {
						return console.error( err );
					}
				});
			});
		});
	});

program
	.command( 'buffer-pool <site>' )
	.option( '-f, --factor <factor>', 'Database growth factor', 0, parseFloat )
	.action( ( site, options ) => {
		try {
			which.sync( 'mysql' );
		} catch ( e ) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		utils.findSite( site, ( err, site ) => {
			let factor;

			if ( options.factor > 0 ) {
				factor = options.factor;
			} else {
				// Set factor depending on environment
				factor = site.environment_name === 'production' ? 1.2 : 0.75;
			}

			console.log( '-- Site:', site.client_site_id );
			console.log( '-- Domain:', site.domain_name );
			console.log( '-- Environment:', site.environment_name );
			console.log( '-- Growth Factor:', factor );

			let query = `(SELECT
				CEILING(SUM(data_length)/POWER(1024,2)) data_mb,
				CEILING(SUM(index_length)/POWER(1024,2)) index_mb,
				CEILING(SUM(data_length+index_length)/POWER(1024,2)) total_mb,
				@@innodb_buffer_pool_size/POWER(1024,2) mariadb_current_mb,
				CEILING(SUM(data_length+index_length)*${factor}/POWER(1024,2)) suggested_mb 
				FROM information_schema.tables WHERE engine='InnoDB')`;

			db.query( site, query, err => {
				if ( err ) {
					return console.error( err );
				}
			});

			// get master container with API call
			api
				.get( '/sites/' + site.client_site_id + '/containers?is_db_master=true' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( 'Error retrieving master container!' );
					}
					var masterContainer = res.body.data[0].container_id;

					// get master container metadata
					api
						.get( '/containers/' + masterContainer + '/meta/innodb_buffer_pool_size' )
						.end( ( err, res ) => {
							if ( err.response.statusCode === 404 ) {
								console.log( '-- Master DB config on API (mb): Not configured' );
							}
							else if ( err ) {
								console.log( 'Error retrieving innodb_buffer_pool_size!' );
							}
							else {
								var metadata = res.body.data[0].meta_value.slice( 0, -1 );
								console.log( '-- Master DB config on API (mb): ' + metadata );
							}
						});
				});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
