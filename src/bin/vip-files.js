#!/usr/bin/env node

const program = require( 'commander' );
const http = require( 'http' );
const fs = require( 'fs' );
const path = require( 'path' );
const async = require( 'async' );
const progress = require( 'progress' );

// Ours
const api = require( '../lib/api' );
const constants = require( '../constants' );
const utils = require( '../lib/utils' );

program
	.arguments( '<site>' )
	.option( '-d, --directory <dir>', 'Destination directory' )
	.action( ( site, options ) => {
		// TODO: validate options.directory
		utils.findSite( site, ( err, site ) => {
			if ( ! options.directory ) {
				options.directory = '/tmp/' + site.client_site_id;
			}

			console.log( 'Exporting to:', options.directory );

			api
				.get( '/sites/' + site.client_site_id + '/files' )
				.query({ 'pagesize': 0 }) // Just need totalrecs here
				.end( function( err, res ) {
					if ( err ) {
						return console.error( err.response.error );
					}

					var bar = new progress( 'Exporting [:bar] :percent (:current/:total) :etas', { total: res.body.totalrecs, incomplete: ' ', renderThrottle: 100 });

					async.timesSeries( Math.ceil( res.body.totalrecs / 100 ), function( i, cb ) {
						api
							.get( '/sites/' + site.client_site_id + '/files' )
							.query({ 'pagesize': 100, 'page': i + 1 })
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
										host: constants.VIP_GO_ANYCAST_IP,
										servername: constants.VIP_GO_ANYCAST_IP,
										path: file.file_path,
										headers: {
											'Host': site.domain_name,
										},
									};

									http.get( filedata, download => {
										download.pipe( newFile );
										download.on( 'end', () => {
											bar.tick();
											callback();
										}).on( 'error', callback );
									});
								}, err => cb( err ) );
							});
					});
				});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
