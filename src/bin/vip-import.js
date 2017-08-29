#!/usr/bin/env node

const fs       = require( 'fs' );
const program  = require( 'commander' );
const which = require( 'which' );
const url = require( 'url' );
const aws = require( 'aws-sdk' );
const progress = require( 'progress' );

// Ours
const api      = require( '../lib/api' );
const constants = require( '../constants' );
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
	.command( 'new-files <site> <src>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'File extensions to import', imports.default_types, list )
	.option( '-p, --parallel <threads>', 'Number of files to process in parallel. Default: 5', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	.option( '-d, --dry-run', 'Check and list invalid files' )
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

					return imports.importer( producer, consumer, {
						intermediate: options.intermediate,
						types: options.types,
						concurrency: options.parallel,
						dryRun: options.dryRun,
						token: token,
						site: site,
					});
				});
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
