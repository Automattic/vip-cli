#!/usr/bin/env node

const program = require('commander');
const https = require( 'https' );
const fs = require( 'fs' );
const path = require( 'path' );
const async = require( 'async' );
const progress = require( 'progress' );

// Ours
const api = require('../lib/api');
const utils = require('../lib/utils');

program
	.arguments( '<site>' )
	.option( '-d, --directory <dir>', 'Destination directory' )
	.action( (site, options) => {
		// TODO: validate options.directory
		utils.findSite( site, ( err, site ) => {
			if ( ! options.directory ) {
				options.directory = '/tmp/' + site.client_site_id;
			}

			console.log( "Exporting to:", options.directory )

			api
				.get( '/sites/' + site.client_site_id + '/files' )
				.query({ 'pagesize': 1 }) // Just need totalrecs here
				.end( function( err, res ) {
					if ( err ) {
						return console.error( err.response.error );
					}

					var bar = new progress( 'Importing [:bar] :percent (:current/:total) :etas', { total: res.body.totalrecs, incomplete: ' ', renderThrottle: 100 } );

					async.timesSeries( Math.ceil( res.body.totalrecs / 100 ), function( i, cb ) {
						api
							.get( '/sites/' + site.client_site_id + '/files' )
							.query({ 'pagesize': 100, 'page': i })
							.end( function( err, response ) {
								if ( err ) {
									return cb( err );
								}

								// Download all the files
								async.eachLimit( response.body.data, 5, ( file, callback ) => {
									var dest = options.directory + file.file_path;
									var dir = path.dirname( dest );

									utils.mkdirp( dir );
									var newFile = fs.createWriteStream( dest );

									// Download the file
									var filedata = {
										host: 'files.vipv2.net',
										servername: 'files.vipv2.net',
										path: file.file_path,
										headers: {
											'Host': site.domain_name
										}
									};

									https.get( filedata, download => {
										download.pipe( newFile );
										download.on("end", () => {
											bar.tick();
											newFile.close( callback );
										}).on("error", err => {
											fs.unlink( dest );
											callback( err );
										});
									});
								}, err => cb( err ) );
							});
					});
				});
		});
	});

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
