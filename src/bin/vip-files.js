#!/usr/bin/env node

const program = require('commander');
const http = require( 'http' );
const fs = require( 'fs' );
const path = require( 'path' );
const async = require( 'async' );
const progress = require( 'progress' );

// Ours
const api = require('../lib/api');
const utils = require('../lib/utils');

program
	.arguments( '<site>' )
	.option( '-d, --directory <dir>', 'Download directory' )
	.action( (site, options) => {
		// TODO: validate options.directory
		utils.findSite( site, ( err, site ) => {
			if ( ! options.directory ) {
				options.directory = '/tmp/' + site.client_site_id;
			}

			console.log( "Exporting to:", options.directory )

			api
				.get( '/sites/' + site.client_site_id + '/files' )
				.query({ 'pagesize': 1 })
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
								response.body.data.forEach(file => {
									var dest = options.directory + file.file_path;
									var dir = path.dirname( dest );

									utils.mkdirp( dir );
									var newFile = fs.createWriteStream( dest );

									// Download the file
									var filedata = {
										host: site.domain_name,
										path: file.file_path
									};

									http.get( filedata, download => {
										download.pipe( newFile );
									});

									bar.tick();
								});

								cb();
							});
					});
				});
		});
	});

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
