#!/usr/bin/env node

const program = require('commander');

// Ours
const api = require('../lib/api');
const utils = require('../lib/utils');
const sandbox = require('../lib/sandbox');

program
	.arguments( '<site> [command...]' )
	.action( ( site, command, options ) => {

		// Preemptively query for sites, so we can pass the ID
		// down and avoid duplicate API requests
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			sandbox.getSandboxForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return sandbox.createSandboxForSite( site, ( err, sbox ) => {
						if ( err ) {
							return console.error( err );
						}

						sandbox.runCommand( sbox, command );
					});
				}

				sandbox.runCommand( sbox, command );
			});
		});
	});

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
