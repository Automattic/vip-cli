#!/usr/bin/env node

const program = require( 'commander' );

// ours
const { set } = require( '../lib/config' );

program
	.arguments( '<option>' )
	.action( ( option, options ) => {
		if ( option.indexOf( '=' ) < 0 ) {
			return console.error( 'Invalid option' );
		}

		const parts = option.split( '=' );

		switch( parts[0] ) {
		case 'PROXY':
			break;

		default:
			return console.error( 'Invalid option name' );
		}

		const config = {};
		config[parts[0]] = parts[1];

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
