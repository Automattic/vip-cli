#!/usr/bin/env node

const http     = require( 'https' );
const fs       = require( 'fs' );
const program  = require( 'commander' );
const async    = require( 'async' );
const progress = require( 'progress' );
const request  = require( 'superagent' );
const exec     = require('child_process').exec;
const escape   = require( 'shell-escape' );
const which = require( 'which' );

// Ours
const api      = require( '../lib/api' );
const utils    = require( '../lib/utils' );
const db = require( '../lib/db' );
const imports = require( '../lib/import' );

function list(v) {
	return v.split(',');
}

program
	.command( 'files <site> <directory>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'Types of files to import. Default: jpg,jpeg,png,gif', ['jpg', 'jpeg', 'png', 'gif'], list )
	.option( '-p, --parallel <threads>', 'Number of parallel uploads. Default: 5', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	.option( '-f, --fast', 'Skip existing file check' )
	.action( ( site, directory, options ) => {
		if ( 0 > directory.indexOf( 'uploads' ) ) {
			return console.error( 'Invalid uploads directory. Uploads must be in uploads/' );
		}

		utils.findAndConfirmSite( site, site => {
			api
				.get( '/sites/' + site.client_site_id + '/meta/files_access_token' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					if ( ! res.body || ! res.body.data || ! res.body.data[0] || ! res.body.data[0].meta_value ) {
						return console.error( 'Could not get files access token' );
					}

					var access_token = res.body.data[0].meta_value;
					var bar, filecount = 0;

					var processFiles = function( importing, callback ) {
						var queue = async.priorityQueue( ( file, cb ) => {
							// Handle pointers separately - add next 5k files + next pointer if necessary
							if ( 'ptr:' === file.substring( 0, 4 ) ) {
								var parts = file.split(':');
								var offset = parseInt( parts[1] );
								var file = parts[2];

								// Queue next batch of files in this directory
								return imports.queueDir( file, offset, function( q ) {
									q.forEach(i => {
										queue.push( i.item, i.priority );
									});

									return cb();
								});
							}

							async.waterfall([
								function( cb ) {
									fs.realpath( file, cb );
								},

								function( file, cb ) {
									fs.lstat( file, function( err, stats ) {
										cb( err, file, stats );
									});
								}
							], function( err, file, stats ) {
								if ( err ) {
									return cb( err );
								} else if ( stats.isDirectory() ) {
									// Init directory queueing with offset=0
									imports.queueDir( file, 0, function( q ) {
										q.forEach(i => {
											queue.push( i.item, i.priority );
										});

										return cb();
									});
								} else if ( stats.isFile() ) {
									var filepath = file.split( 'uploads' );
									var ext      = file.split( '.' );

									ext = ext[ ext.length - 1 ];

									if ( ! ext || options.types.indexOf( ext ) < 0 ) {
										return cb( new Error( "Unsupported filetype: " + file ) );
									}

									if ( ! options.intermediate && /-\d+x\d+\.\w{3,4}$/.test( file ) ) {
										return cb( new Error( 'Skipping intermediate image: ' + file ) );
									}

									if ( ! filepath[1] ) {
										return cb( new Error( 'Invalid file path. Files must be in uploads/ directory.' ) );
									}

									if ( ! importing ) {
										filecount++;

										if ( 0 === filecount % 10000 ) {
											console.log( filecount );
										}

										return cb();
									}

									if ( options.fast ) {
										bar.tick();
										return imports.upload( site, file, access_token, cb );
									} else {
										request
											.get( 'https://files.vipv2.net/wp-content/uploads' + filepath[1] )
											.set({ 'X-Client-Site-ID': site.client_site_id })
											.set({ 'X-Access-Token': access_token })
											.set({ 'X-Action': 'file_exists' })
											.timeout( 2000 )
											.end( err => {
												bar.tick();

												if ( err && err.status === 404 ) {
													return imports.upload( site, file, access_token, cb );
												}

												return cb( err );
											});
									}
								} else {
									return cb();
								}
							});
						}, 5 );

						if ( callback ) {
							queue.drain = callback;
						}

						// Start it
						queue.push( directory, 1 );
					};

					// TODO: Cache file count to disk, hash directory so we know if the contents change?
					console.log( 'Counting files...' );
					processFiles( false, function() {
						bar = new progress( 'Importing [:bar] :percent (:current/:total) :etas', { total: filecount, incomplete: ' ', renderThrottle: 100 } );
						console.log( 'Importing ' + filecount + ' files...' );
						processFiles( true )
					});
				});
		});
	});

program
	.command( 'sql <site> <file>' )
	.alias( 'database' )
	.description( 'Import SQL to a VIP Go site' )
	.action( ( site, file ) => {
		try {
			var mysql_exists = which.sync( 'mysql' );
		} catch (e) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		utils.findAndConfirmSite( site, site => {
			db.importDB( site, file, err => {
				if ( err ) {
					return console.error( err );
				}

				api
					.post( '/sites/' + site.client_site_id + '/wp-cli' )
					.send({
						command: "cache",
						args: [ "flush" ],
						namedvars: {
							"skip-plugins": true,
							"skip-themes": true,
						},
					})
					.end();
			});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
