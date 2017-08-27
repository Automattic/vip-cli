#!/usr/bin/env node

const fs       = require( 'fs' );
const program  = require( 'commander' );
const async    = require( 'async' );
const progress = require( 'progress' );
const request  = require( 'superagent' );
const which = require( 'which' );
const url = require( 'url' );
const aws = require( 'aws-sdk' );
const https = require( 'https' );
const concat = require( 'concat-stream' );
const path = require( 'path' );

// Ours
const api      = require( '../lib/api' );
const constants = require( '../constants' );
const utils    = require( '../lib/utils' );
const db = require( '../lib/db' );
const imports = require( '../lib/import' );
const files = require( '../lib/files' );

// Config
const FORCE_FAST_IMPORT_LIMIT = 100;
const MAX_IMPORT_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

function list( v ) {
	return v.split( ',' );
}

const default_types = [
	'jpg','jpeg','jpe',
	'gif',
	'png',
	'bmp',
	'tiff','tif',
	'ico',
	'asf',
	'asx',
	'wmv','wmx','wm',
	'avi',
	'divx',
	'mov',
	'qt',
	'mpeg','mpg','mpe','mp4','m4v',
	'ogv',
	'webm',
	'mkv',
	'3gp','3gpp','3g2','3gp2',
	'txt',
	'asc',
	'c','cc','h',
	'srt',
	'csv','tsv',
	'ics',
	'rtx',
	'css',
	'vtt',
	'dfxp',
	'mp3',
	'm4a','m4b',
	'ra',
	'ram',
	'wav',
	'ogg',
	'oga',
	'mid','midi',
	'wma',
	'wax',
	'mka',
	'rtf',
	'js',
	'pdf',
	'class',
	'psd',
	'xcf',
	'doc',
	'pot',
	'pps',
	'ppt',
	'wri',
	'xla','xls','xlt','xlw',
	'mdb','mpp',
	'docx','docm','dotx','dotm',
	'xlsx','xlsm','xlsb','xltx','xltm','xlam',
	'pptx','pptm','ppsx','ppsm','potx','potm','ppam',
	'sldx','sldm',
	'onetoc','onetoc2','onetmp','onepkg','oxps',
	'xps',
	'odt','odp','ods','odg','odc','odb','odf',
	'wp','wpd',
	'key','numbers','pages',
];

function importer( producer, consumer, opts, done ) {
	opts = Object.assign({
		concurrency: 5,
		types: default_types,
		intermediate: false,
	}, opts );

	if ( ! opts.site ) {
		return done( new Error( 'Missing site reference' ) );
	}

	if ( ! opts.token ) {
		return done( new Error( 'Missing files service token' ) );
	}

	let q = async.priorityQueue( ( file, callback ) => {
		if ( file.init || file.ptr ) {
			return producer( file.ptr || null, q, callback );
		} else if ( file.path ) {
			file = file.path;

			// Validate filename
			async.parallel( [
				function( cb ) {
					// Check extension
					let ext = path.extname( file ).substr( 1 );
					if ( ! ext || opts.types.indexOf( ext.toLowerCase() ) < 0 ) {
						return cb( new Error( 'Invalid extension: ' + file ) );
					}

					return cb();
				},
				function( cb ) {
					// Check filename
					if ( ! /^[a-zA-Z0-9\/\._-]+$/.test( file ) ) {
						return cb( new Error( 'Invalid filename:' + file ) );
					}

					return cb();
				},
				function( cb ) {
					// Check intermediate image
					let int_re = /-\d+x\d+(\.\w{3,4})$/;
					if ( ! opts.intermediate && int_re.test( file ) ) {
						// TODO Check if the original file exists
						return cb( new Error( 'Skipping intermediate image: ' + file ) );
					}

					return cb();
				},
			], err => {
				if ( err ) {
					console.error( err.toString() );
					return callback( err );
				}

				return consumer( file, ( err, stream, path ) => {
					if ( err ) {
						return callback( err );
					}

					console.log( file );
					upload( stream, path, opts.site, opts.token, {}, err => {
						if ( err ) {
							console.error( err.toString() );
						}

						callback( err );
					});
				});
			});
		} else {
			return callback( new Error( 'Unknown object type' ) );
		}
	}, opts.concurrency );

	// Kick off the importer
	q.push({ init: true }, 1 );

	if ( done ) {
		q.drain = function() {
			if ( q.workersList().length <= 0 ) {
				// Queue is empty and all workers finished
				done();
			}
		};
	}
}

function upload( stream, path, site, token, opts, callback ) {
	opts = Object.assign({
		checkExists: true,
	}, opts );

	if ( ! token ) {
		return callback( new Error( 'Missing files service token' ) );
	}

	let filepath = path.split( 'uploads' );

	if ( opts.checkExists ) {
		request
			.get( encodeURI( 'https://' + constants.FILES_SERVICE_ENDPOINT + '/wp-content/uploads' + filepath[1] ) )
			.set({ 'X-Client-Site-ID': site.client_site_id })
			.set({ 'X-Access-Token': token })
			.set({ 'X-Action': 'file_exists' })
			.timeout( 1000 )
			.end( err => {
				if ( err && err.status === 404 ) {
					opts.checkExists = false;
					return upload( stream, path, site, token, opts, callback );
				}

				return callback( err );
			});
	} else {
		stream.on( 'error', callback );
		stream.pipe( concat( data => {
			if ( Buffer.byteLength( data ) > MAX_IMPORT_FILE_SIZE ) {
				return callback( new Error( 'File exceeded max file size: ' + path ) );
			}

			let req = https.request({
				hostname: constants.FILES_SERVICE_ENDPOINT,
				method: 'PUT',
				path: encodeURI( '/wp-content/uploads' + filepath[1] ),
				headers: {
					'X-Client-Site-ID': site.client_site_id,
					'X-Access-Token': token,
				},
			}, callback );

			req.on( 'socket', socket => {
				socket.setTimeout( 10000 );
				socket.on( 'timeout', () => {
					req.abort();
				});
			});

			req.write( data );
			req.end();
		}) );
	}
}

program
	.command( 'new-files <site> <src>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'File extensions to import', default_types, list )
	.option( '-p, --parallel <threads>', 'Number of files to process in parallel. Default: 5', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	//.option( '-d, --dry-run', 'Check and list invalid files' )
	.option( '--aws-key <key>', 'AWS Key' )
	.option( '--aws-secret <key>', 'AWS Secret' )
	.action( ( site, src, options ) => {
		src = url.parse( src );

		// TODO: Skip existing files checks for new sites
		// TODO: Set up logger (too big files, intermediates, invalid extensions, bad characters in filename)

		utils.findAndConfirmSite( site, 'Importing files for site:', ( err, site ) => {
			if ( err || ! site ) {
				return console.log( 'Error finding site' );
			}

			// Get access token
			api
				.get( '/sites/' + site.client_site_id + '/meta/files_access_token' )
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					if ( ! res.body || ! res.body.data || ! res.body.data[0] || ! res.body.data[0].meta_value ) {
						return console.error( 'Could not get files access token' );
					}

					let token = res.body.data[0].meta_value;

					// Set up consumer and producer
					var consumer, producer;
					switch ( src.protocol ) {
					case 's3:':
						// Set AWS config
						aws.config.update({
							accessKeyId: options.awsKey,
							secretAccessKey: options.awsSecret,
						});

						var s3 = new aws.S3();
						var params = {
							Bucket: src.hostname,
							MaxKeys: 200,
						};

						// Set S3 path prefix
						if ( src.path && src.path.length > 1 && src.path.charAt( 0 ) === '/' ) {
							params.Prefix = src.path.substr( 1 );
						}

						producer = ( ptr, q, callback ) => {
							if ( ptr ) {
								params.ContinuationToken = ptr;
							}

							s3.listObjectsV2( params, ( err, data ) => {
								if ( err ) {
									console.error( err );
									return callback( err );
								}

								// Queue next batch
								if ( data.IsTruncated ) {
									q.push({ ptr: data.NextContinuationToken });
								}

								var files = data.Contents.map( f => { return { path: f.Key }; });
								q.push( files );
								return callback();
							});
						};

						consumer = ( file, callback ) => {
							var filestream = s3.getObject({ Bucket: src.hostname, Key: file }).createReadStream();
							callback( null, filestream, file );
						};
						break;

					case 'http:':
					case 'https:':
						// TODO: Handle .tar.gz, .zip
						src = src.href;
						break;

					default:
						src = src.pathname;
						break;
					}

					if ( ! consumer || ! producer ) {
						return console.error( 'Missing consumer or producer' );
					}

					return importer( producer, consumer, {
						intermediate: options.intermediate,
						types: options.types,
						concurrency: options.parallel,
						token: token,
						site: site,
					});
				});
		});
	});

program
	.command( 'files <site> <directory>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'Types of files to import', default_types, list )
	.option( '-e, --extra-types <types>', 'Additional file types to allow that are not included in WordPress defaults', [], list )
	.option( '-p, --parallel <threads>', 'Number of parallel uploads. Default: 5', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	.option( '-f, --fast', 'Skip existing file check' )
	.option( '-d, --dry-run', 'Check and list invalid files' )
	.action( ( site, directory, options ) => {
		if ( 0 > directory.indexOf( 'uploads' ) ) {
			return console.error( 'Invalid uploads directory. Uploads must be in uploads/' );
		}

		utils.findAndConfirmSite( site, 'Importing files for site:', ( err, site ) => {
			files.list( site, { 'pagesize': 0 }) // just need totalrecs here
				.then( res => res.totalrecs )
				.then( total => {
					if ( total < FORCE_FAST_IMPORT_LIMIT ) {
						options.fast = true;
					}

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
							var logfile = `/tmp/import-${site.client_site_id}-${Date.now()}.log`;
							var extensions = fs.createWriteStream( logfile + '.ext' );
							var intermediates = fs.createWriteStream( logfile + '.int' );
							var invalidFiles = fs.createWriteStream( logfile + '.filenames' );
							var filesize = fs.createWriteStream( logfile + '.filesize' );

							var processFiles = function( importing, callback ) {
								var queue = async.priorityQueue( ( file, cb ) => {
									// Handle pointers separately - add next 5k files + next pointer if necessary
									if ( 'ptr:' === file.substring( 0, 4 ) ) {
										var parts = file.split( ':' );
										var offset = parseInt( parts[1] );

										file = parts[2];

										// Queue next batch of files in this directory
										return imports.queueDir( file, offset, function( q ) {
											q.forEach( i => {
												queue.push( i.item, i.priority );
											});

											return cb();
										});
									}

									async.waterfall( [
										function( cb ) {
											fs.realpath( file, cb );
										},

										function( file, cb ) {
											fs.lstat( file, function( err, stats ) {
												cb( err, file, stats );
											});
										},
									], function( err, file, stats ) {
										if ( err ) {
											return cb( err );
										} else if ( stats.isSymbolicLink() ) {
											return cb( new Error( 'Invalid file: symlink' ) );
										} else if ( stats.isDirectory() ) {
											// Init directory queueing with offset=0
											imports.queueDir( file, 0, function( q ) {
												q.forEach( i => {
													queue.push( i.item, i.priority );
												});

												return cb();
											});
										} else if ( stats.isFile() ) {
											var filepath = file.split( 'uploads' );
											var ext      = file.split( '.' );

											ext = ext[ ext.length - 1 ];

											if ( stats.size > MAX_IMPORT_FILE_SIZE ) {
												return filesize.write( file + '\n', cb );
											}

											if ( ! ext || ( options.types.indexOf( ext.toLowerCase() ) < 0 && options.extraTypes.indexOf( ext.toLowerCase() ) < 0 ) ) {
												if ( options.dryRun || importing ) {
													return extensions.write( file + '\n', cb );
												}

												return cb( new Error( 'Invalid file extension' ) );
											}

											if ( ! /^[a-zA-Z0-9\/\._-]+$/.test( file ) ) {
												if ( options.dryRun || importing ) {
													return invalidFiles.write( file + '\n', cb );
												}

												return cb( new Error( 'Invalid filename' ) );
											}

											let int_re = /-\d+x\d+(\.\w{3,4})$/;
											if ( ! options.intermediate && int_re.test( file ) ) {
												// Check if the original file exists
												let orig = file.replace( int_re, '$1' );

												try {
													fs.statSync( orig );

													if ( options.dryRun || importing ) {
														return intermediates.write( file + '\n', cb );
													}

													return cb( new Error( 'Skipping intermediate image: ' + file ) );
												} catch ( e ) {
													// continue
												}
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
												.get( encodeURI( 'https://' + constants.FILES_SERVICE_ENDPOINT + '/wp-content/uploads' + filepath[1] ) )
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
									queue.drain = function() {
										if ( queue.workersList().length <= 0 ) {
											// Queue is empty and all workers finished
											callback();
										}
									};
								}

								// Start it
								queue.push( directory, 1 );
							};

							const finish_log = function() {
								extensions.end();
								intermediates.end();
								invalidFiles.end();
								filesize.end();

								let data;
								let extHeader = "Skipped with unsupported extension:";
								let intHeader = "Skipped intermediate images:";
								let fileHeader = "Skipped invalid filenames:";
								let sizeHeader = "Skipped large files:";

								extHeader += '\n' + '='.repeat( extHeader.length ) + '\n\n';
								intHeader += '\n' + '='.repeat( intHeader.length ) + '\n\n';
								fileHeader += '\n' + '='.repeat( fileHeader.length ) + '\n\n';
								sizeHeader += '\n' + '='.repeat( sizeHeader.length ) + '\n\n';

								// Append invalid file extensions
								fs.appendFileSync( logfile, extHeader );

								try {
									data = fs.readFileSync( logfile + '.ext' );
									fs.appendFileSync( logfile, data + '\n\n' );
									fs.unlinkSync( logfile + '.ext' );
								} catch ( e ) {
									fs.appendFileSync( logfile, "None\n\n" );
								}


								// Append intermediate images
								fs.appendFileSync( logfile, intHeader );

								try {
									data = fs.readFileSync( logfile + '.int' );
									fs.appendFileSync( logfile, data + '\n\n' );
									fs.unlinkSync( logfile + '.int' );
								} catch ( e ) {
									fs.appendFileSync( logfile, "None\n\n" );
								}

								// Append invalid filenames
								fs.appendFileSync( logfile, fileHeader );

								try {
									data = fs.readFileSync( logfile + '.filenames' );
									fs.appendFileSync( logfile, data + '\n\n' );
									fs.unlinkSync( logfile + '.filenames' );
								} catch ( e ) {
									fs.appendFileSync( logfile, "None\n\n" );
								}

								// Append invalid filenames
								fs.appendFileSync( logfile, sizeHeader );

								try {
									data = fs.readFileSync( logfile + '.filesize' );
									fs.appendFileSync( logfile, data + '\n\n' );
									fs.unlinkSync( logfile + '.filesize' );
								} catch ( e ) {
									fs.appendFileSync( logfile, "None\n\n" );
								}

								console.log( `Import log: ${logfile}` );
							};

							// TODO: Cache file count to disk, hash directory so we know if the contents change?
							console.log( 'Counting files...' );
							processFiles( false, function() {
								if ( options.dryRun ) {
									finish_log();
									return;
								}

								bar = new progress( 'Importing [:bar] :percent (:current/:total) :etas', { total: filecount, incomplete: ' ', renderThrottle: 100 });
								console.log( 'Importing ' + filecount + ' files...' );
								processFiles( true, function() {
									finish_log();
								});
							});
						});
				})
				.catch( err => console.error( err ) );
		});
	});

program
	.command( 'sql <site> <file>' )
	.alias( 'database' )
	.alias( 'db' )
	.description( 'Import SQL to a VIP Go site' )
	.option( '-t, --throttle <mb>', 'SQL import transfer limit in MB/s', 1, parseFloat )
	.option( '-s, --skip-confirm', 'Skip the confirmation step' )
	.action( ( site, file, options ) => {
		try {
			which.sync( 'mysql' );
		} catch ( e ) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		var opts = {
			throttle: options.throttle,
		};

		try {
			var stats = fs.lstatSync( file );
		} catch( e ) {
			return console.error( 'Failed to get import file (%s) due to the following error:\n%s', file, e.message );
		}

		const importCallback = ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			db.importDB( site, file, opts, err => {
				if ( err ) {
					return console.error( err );
				}

				api
					.post( '/sites/' + site.client_site_id + '/wp-cli' )
					.send({
						command: 'cache',
						args: [ 'flush' ],
						namedvars: {
							'skip-plugins': true,
							'skip-themes': true,
						},
					})
					.end();
			});
		};

		if ( ! options.skipConfirm ) {
			utils.findAndConfirmSite( site, 'Importing SQL for site:', importCallback );
		} else {
			utils.findSite( site, importCallback );
		}
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
