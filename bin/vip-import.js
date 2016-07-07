#!/usr/bin/env node

const http     = require( 'https' );
const fs       = require( 'fs' );
const program  = require( 'commander' );
const async    = require( 'async' );
const progress = require( 'progress' );
const mysql    = require( 'mysql' );
const api      = require( '../src/api' );
const utils    = require( '../src/utils' );
const request  = require( 'superagent' );
const exec     = require('child_process').exec;
const escape   = require( 'shell-escape' );

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

					var cd = escape([ 'cd', directory ]);
					exec( cd + '; find -type f | wc -l', ( error, stdout, stderr ) => {
						if ( ! error ) {
							var bar = new progress( 'Importing [:bar] :percent (:current/:total) :etas', { total: parseInt( stdout ), incomplete: ' ', renderThrottle: 100 } );
						}

						// Simple async queue with limit 5
						var queue = async.priorityQueue( ( file, cb ) => {
							var file  = fs.realpathSync( file );
							var stats = fs.lstatSync( file );
							var depth = file.split( '/' ).length;

							if ( stats.isDirectory() ) {
								var files = fs.readdirSync( file );
								files     = files.map( f => file + '/' + f );

								queue.push( files, 0 - depth );
							} else {
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

								var url      = 'https://files.vipv2.net/wp-content/uploads' + filepath[1];
								var filename = file.split( '/' );

								filename = filename[ filename.length - 1 ];

								var upload = ( file, cb ) => {
									var data = fs.readFileSync( file );

									var req = http.request({
										hostname: 'files.vipv2.net',
										method:   'PUT',
										path:     '/wp-content/uploads' + filepath[1],
										headers:  {
											'X-Client-Site-ID': site.client_site_id,
											'X-Access-Token': access_token,
											'Content-Length': Buffer.byteLength( data ),
										}
									}, res => {
										if ( bar ) {
											bar.tick();
										}

										if ( res.statusCode !== 200 ) {
											return cb( res.statusCode, file );
										}

										cb();
									});

									req.on( 'socket', function ( socket ) {
										socket.setTimeout( 10000 );
										socket.on( 'timeout', function() {
									    	req.abort();
										});
									});

									req.write( data );
									req.end();
								};

								// Upload file
								if ( options.fast ) {
									return upload( file, cb );
								} else {
									request
										.get( url )
										.set({ 'X-Client-Site-ID': site.client_site_id })
										.set({ 'X-Access-Token': access_token })
										.set({ 'X-Action': 'file_exists' })
										.timeout( 2000 )
										.end( err => {
											if ( err && err.status === 404 ) {
												return upload( file, cb );
											} else if ( err ) {
												if ( bar ) {
													bar.tick();
												}
												return cb( err );
											}

											if ( bar ) {
												bar.tick();
											}
											cb();
										});
								}
							}
						}, options.parallel );

						queue.push( directory, 1 );
					});
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

					var bar = new progress( 'Importing [:bar] :percent :etas', { total: sql.length, incomplete: ' ', renderThrottle: 100 } );

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

							if ( err ) {
								console.error( err );
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
		});
	});

program.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
