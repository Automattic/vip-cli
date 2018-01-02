#!/usr/bin/env node

const fs       = require( 'fs' );
const program  = require( 'commander' );
const which = require( 'which' );
const url = require( 'url' );
const aws = require( 'aws-sdk' );
const measureStream = require( 'measure-stream' );

// Ours
const api      = require( '../lib/api' );
const utils    = require( '../lib/utils' );
const db = require( '../lib/db' );
const imports = require( '../lib/import' );
const files = require( '../lib/files' );

// Config
const FORCE_FAST_IMPORT_LIMIT = 100;

function list( v ) {
	return v.split( ',' );
}

program
	.command( 'files <site> <src>' )
	.description( 'Import files to a VIP Go site' )
	.option( '--dry-run', 'Check and list invalid files', false )
	.option( '--intermediate', 'Upload intermediate images', false )
	.option( '--skip-check-exists', 'Skip file checking if the file already exists', false )
	.option( '-p, --parallel <threads>', 'Number of files to process in parallel. Default: 5', 5, parseInt )
	.option( '-t, --types <types>', 'File extensions to import', imports.default_types, list )
	.option( '--aws-key <key>', 'AWS Key' )
	.option( '--aws-secret <key>', 'AWS Secret' )
	.action( ( site, src, options ) => {
		src = url.parse( src );

		if ( src.path.search( 'uploads' ) === -1 ) {
			return console.error( 'Source path must contain `/uploads`' );
		}

		utils.findAndConfirmSite( site, 'Importing files for site:', ( err, site ) => {
			if ( err || ! site ) {
				return console.log( 'Error finding site' );
			}

			files.list( site, { 'pagesize': 0 }) // just need totalrecs here
				.then( res => res.totalrecs )
				.then( total => {
					if ( total < FORCE_FAST_IMPORT_LIMIT ) {
						options.skipCheckExists = true;
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

							var start = Date.now() / 1000;
							var totalLength = 0;
							let token = res.body.data[0].meta_value;

							try {
								var importer = new imports.Importer({
									checkExists: !options.skipCheckExists,
									concurrency: options.parallel,
									dryRun: !!options.dryRun,
									intermediate: !!options.intermediate,
									site: site,
									token: token,
									types: options.types,
								}, count => {
									var end = Date.now() / 1000;
									var totalSeconds = end - start;

									console.log( 'File count:', count );
									console.log( 'Total size:', totalLength );
									console.log( 'Bytes per second:', totalLength/totalSeconds );
								});
							} catch ( e ) {
								return console.error( e.toString() );
							}

							// Set up consumer and producer
							switch ( src.protocol ) {
							case 's3:':
								if ( ! options.awsKey || ! options.awsSecret ) {
									return console.error( 'AWS Key and AWS Secret are required for imports from S3' );
								}

								// Set AWS config
								aws.config.update({
									accessKeyId: options.awsKey,
									secretAccessKey: options.awsSecret,
								});

								var s3 = new aws.S3();
								var params = {
									Bucket: src.hostname,
									MaxKeys: 500,
								};

								// Set S3 path prefix
								if ( src.path && src.path.length > 1 && src.path.charAt( 0 ) === '/' ) {
									params.Prefix = src.path.substr( 1 );
								}

								importer.setProducer( ( ptr, callback ) => {
									if ( ptr ) {
										params.ContinuationToken = ptr;
									}

									s3.listObjectsV2( params, ( err, data ) => {
										if ( err ) {
											return callback( err );
										}

										if ( data.IsTruncated && data.NextContinuationToken ) {
											importer.queuePtr( data.NextContinuationToken );
										}

										data.Contents.forEach( f => {
											importer.queueFile( f.Key );
										});

										callback();
									});
								});

								importer.setConsumer( ( file, callback ) => {
									let measure = new measureStream();
									let filestream = s3.getObject({ Bucket: src.hostname, Key: file }).createReadStream();
									let upload = importer
										.upload( file );

									// TODO retry on error
									upload.on( 'error', callback );
									filestream.on( 'error', callback );
									filestream.on( 'end', callback );

									measure.on( 'finish', () => {
										totalLength += measure.measurements.totalLength;
									});

									filestream.pipe( measure ).pipe( upload );
								});
								break;

							case 'http:':
							case 'https:':
								// TODO: Handle .tar.gz, .zip
								src = src.href;
								break;

							default:
								src = src.pathname;

								importer.setProducer( ( ptr, callback ) => {
									let file;
									if ( ptr && ptr.dir ) {
										file = ptr.dir;
									} else if ( ptr ) {
										return callback( new Error( 'Invalid pointer' ) );
									} else {
										file = src;
									}

									let offset = ptr && ptr.offset ? ptr.offset : 0;
									fs.lstat( file, ( err, stats ) => {
										if ( err ) {
											return callback( err );
										}

										if ( stats.isFile() ) {
											importer.queueFile( file );
											return callback();
										} else if ( stats.isDirectory() ) {
											fs.readdir( file, ( err, files ) => {
												if ( files.length <= 0 ) {
													return callback();
												}

												for ( let i = offset; i < offset + 5000; i++ ) {
													if ( files[i] ) {
														importer.queuePtr({ dir: file + '/' + files[i] });
													}
												}

												if ( files.length - offset > 5000 ) {
													importer.queuePtr({ dir: file, offset: offset + 5000 });
												}

												return callback();
											});
										} else {
											return callback( new Error( 'Unknown file type' ) );
										}
									});
								});

								importer.setConsumer( ( file, callback ) => {
									let measure = new measureStream();
									let filestream = fs.createReadStream( file );
									let upload = importer
										.upload( file );

									// TODO retry on error
									upload.on( 'error', callback );
									filestream.on( 'error', callback );
									filestream.on( 'end', callback );

									measure.on( 'finish', () => {
										totalLength += measure.measurements.totalLength;
									});

									filestream.pipe( measure ).pipe( upload );
								});

								break;
							}

							importer.start();
						});
				});
		});
	});

function searchReplace( v, total ) {
	total = total || {};
	v = v.split( ',' );

	if ( v.length < 2 ) {
		return total;
	}

	let i = {};
	i[ v[0] ] = v[1];

	total = Object.assign( total, i );
	return total;
}

program
	.command( 'sql <site> <file>' )
	.alias( 'database' )
	.alias( 'db' )
	.description( 'Import SQL to a VIP Go site' )
	.option( '-t, --throttle <mb>', 'SQL import transfer limit in MB/s', 5, parseFloat )
	.option( '-s, --skip-confirm', 'Skip the confirmation step' )
	.option( '--search-replace <from,to>', 'Search/Replace tuple', searchReplace, {})
	.action( ( site, file, options ) => {
		try {
			which.sync( 'mysql' );
		} catch ( e ) {
			return console.error( 'MySQL client is required and not installed.' );
		}

		var opts = {
			throttle: options.throttle,
			replace: options.searchReplace,
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
						command: 'vip',
						args: [ 'migration', 'cleanup' ],
						namedvars: {
							'yes': true,
							'network': true,
							'skip-plugins': true,
							'skip-themes': true,
						},
					})
					.end();
			});
		};

		if ( ! options.skipConfirm ) {
			let info = [];
			if ( options.searchReplace ) {
				Object.keys( options.searchReplace ).forEach( from => {
					let to = options.searchReplace[from];
					info.push( `-- Search Replace: ${ from } -> ${ to }` );
				});
			}

			utils.findAndConfirmSite( site, 'Importing SQL for site:', info, importCallback );
		} else {
			utils.findSite( site, importCallback );
		}
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
