#!/usr/bin/env node

const program = require('commander');
const spawn = require('child_process').spawn;

// Ours
const utils = require('../lib/utils');

program
	.arguments( 'cli <site> [command...]' )
	.action( ( site, command, options ) => {
		utils.getSandboxForSite( site, ( err, sandbox ) => {
			if ( err ) {
				return console.error( err );
			}

			var run = [
				'exec',
				'-u', '1001',
				'-it', sandbox.container_name,
				'env', 'TERM=xterm',
			];

			if ( command.length < 1 ) {
				run.push( 'bash' );
			} else {
				run = run.concat( command );

				// TODO: Define this in wp-cli.yml
				if ( "wp" == command[0] ) {
					run.push( '--path=/var/www' );
				}
			}

			// TODO: Handle file references as arguments
			spawn( 'docker', run, { stdio: 'inherit' } );
		});
	});

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
