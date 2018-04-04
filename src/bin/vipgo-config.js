#!/usr/bin/env node

const program = require( 'commander' );

// ours
const { set } = require( '../lib/config' );

// config
const options = [ 'PROXY' ];

program
	.arguments( '<option>' )
	.action( ( option ) => {
		if ( option.indexOf( '=' ) < 0 ) {
			return console.error( 'Invalid option argument provided. The argument must be in the format `name=value` (e.g. `PROXY=127.0.0.1:8080`)' );
		}

		const parts = option.split( '=' );
		const name = parts[0];
		const value = parts[1];

		if ( options.indexOf( name ) < 0 ) {
			return console.error( 'Invalid option name' );
		}

		const config = {};
		config[name] = value;
		set( 'env', config, err => {
			if ( err ) {
				return console.error( err );
			}
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
