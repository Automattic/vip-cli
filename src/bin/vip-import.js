#!/usr/bin/env node

const fs       = require( 'fs' );
const program  = require( 'commander' );
const async    = require( 'async' );
const progress = require( 'progress' );
const request  = require( 'superagent' );
const which = require( 'which' );

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
	'tar','zip','gz','gzip','rar','7z',
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

program
	.command( 'files <site> <directory>' )
	.description( 'Import files to a VIP Go site' )
	.option( '-t, --types <types>', 'Types of files to import', default_types, list )
	.option( '-e, --extra-types <types>', 'Additional file types to allow that are not included in WordPress defaults', [], list )
	.option( '-p, --parallel <threads>', 'Number of parallel uploads. Default: 5', 5, parseInt )
	.option( '-i, --intermediate', 'Upload intermediate images' )
	.option( '-f, --fast', 'Skip existing file check' )
	.action( ( site, directory, options ) => {
		if ( 0 > directory.indexOf( 'uploads' ) ) {
			return console.error( 'Invalid uploads directory. Uploads must be in uploads/' );
		}

		utils.findAndConfirmSite( site, 'Importing files for site:', site => {
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

											if ( ! ext || ( options.types.indexOf( ext.toLowerCase() ) < 0 && options.extraTypes.indexOf( ext.toLowerCase() ) < 0 ) ) {
												return extensions.write( file + '\n', cb );
											}

											if ( ! options.intermediate && /-\d+x\d+\.\w{3,4}$/.test( file ) ) {
												return intermediates.write( file + '\n', cb );
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
												.get( encodeURI( 'https://files.vipv2.net/wp-content/uploads' + filepath[1] ) )
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
								bar = new progress( 'Importing [:bar] :percent (:current/:total) :etas', { total: filecount, incomplete: ' ', renderThrottle: 100 });
								console.log( 'Importing ' + filecount + ' files...' );
								processFiles( true, function() {
									extensions.end();
									intermediates.end();

									let data;
									let extHeader = "Skipped with unsupported extension:";
									let intHeader = "Skipped intermediate images:";

									extHeader += '\n' + '='.repeat( extHeader.length ) + '\n\n';
									intHeader += '\n' + '='.repeat( intHeader.length ) + '\n\n';

									fs.appendFileSync( logfile, extHeader );

									try {
										data = fs.readFileSync( logfile + '.ext' );
										fs.appendFileSync( logfile, data + '\n\n' );
										fs.unlinkSync( logfile + '.ext' );
									} catch ( e ) {
										fs.appendFileSync( logfile, "None\n\n" );
									}


									fs.appendFileSync( logfile, intHeader );

									try {
										data = fs.readFileSync( logfile + '.int' );
										fs.appendFileSync( logfile, data + '\n\n' );
										fs.unlinkSync( logfile + '.int' );
									} catch ( e ) {
										fs.appendFileSync( logfile, "None\n\n" );
									}

									console.log( `Import log: ${logfile}` );
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

		utils.findAndConfirmSite( site, 'Importing SQL for site:', site => {
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
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
