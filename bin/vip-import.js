#!/usr/bin/env node

var fs = require( 'fs' );
var program = require( 'commander' );
var async = require( 'async' );
var progress = require( 'progress' );
var mysql = require( 'mysql' );
var api = require( '../src/api' );
var utils = require( '../src/utils' );

function list(v) {
	return v.split(',');
}

program
	.command( 'files <site> <directory>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'Types of files to import', ['jpg', 'jpeg', 'png', 'gif'], list )
	.option( '-p, --parallel <threads>', 'Number of parallel uploads', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	.action( ( site, directory, options ) => {
		utils.findAndConfirmSite( site, site => {
			api
				.get( '/sites/' + site.client_site_id + '/meta/files_access_token' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					// TODO: Progress bar

					// Simple async queue with limit 5
					var queue = async.priorityQueue( ( file, cb ) => {
						var file = fs.realpathSync( file );
						var stats = fs.lstatSync( file );
						var depth = file.split( '/' ).length;

						if ( stats.isDirectory() ) {
							var files = fs.readdirSync( file );
							files = files.map( f => file + '/' + f );
							queue.push( files, 0 - depth );
						} else {
							var ext = file.split( '.' );
							ext = ext[ ext.length - 1 ];

							if ( ! ext || options.types.indexOf( ext ) < 0 ) {
								return cb( new Error( "Unsupported filetype: " + file ) );
							}

							if ( ! options.intermediate && /-\d+x\d+\.\w{3,4}$/.test( file ) ) {
								return cb( new Error( 'Skipping intermediate image: ' + file ) );
							}

							// TODO: Upload file
						}

						cb();
					}, options.parallel );

					queue.push( directory, 1 );
				});
		});
	});

program
	.command( 'sql <site> <file>' )
	.description( 'Import SQL to a VIP Go site' )
	.action( ( site, file ) => {
		utils.findAndConfirmSite( site, site => {

			// Get mysql info
			api
				.get( '/sites/' + site.client_site_id + '/masterdb' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					var db = res.body,
						sql = fs.readFileSync( file ).toString()
							.split( /;(\r\n|\r|\n)/ )
							.map( s => s.trim() )
							.filter( s => s.length > 0 );

					var connection = mysql.createConnection({
						host: db.host,
						port: db.port,
						user: db.username,
						password: db.password,
						database: db.name,
					});

					var bar = new progress( 'Importing [:bar] :percent :etas', { total: sql.length } );

					// Test DB connection
					connection.query( 'SELECT 1', err => {
						if ( err ) {
							return console.error( err );
						}

						async.eachSeries( sql, ( sql, cb ) => {

							// Import sql
							connection.query( sql, err => {
								if ( err ) {
									return cb( err );
								}

								// Report progress
								bar.tick();
								cb();
							});
						}, err => {
							connection.end();
							// TODO: Queue cache flush

							if ( err ) {
								console.error( err );
							}
						});
					});
				});
		});
	});

program.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
