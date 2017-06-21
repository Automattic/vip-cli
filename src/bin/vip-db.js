#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );
const which = require( 'which' );

// Ours
const db = require( '../lib/db' );
const utils = require( '../lib/utils' );

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
	.action( ( site, options ) => {
		try {
			which.sync( 'mysql' );
		} catch ( e ) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		utils.findSite( site, ( err, site ) => {
			let factor = site.environment === 'production' ? 1.6 : 1;
			let query = `SELECT SUM(data_length) data_bytes,
				SUM(index_length) index_bytes,
				SUM(data_length+index_length) total_bytes,
				CEILING(SUM(data_length+index_length)*${factor}/POWER(1024,2)) innodb_mb
			FROM information_schema.tables WHERE engine='InnoDB'`;

			db.query( site, query, err => {
				if ( err ) {
					return console.error( err );
				}
			});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
