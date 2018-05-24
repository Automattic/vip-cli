#!/usr/bin/env node

const program = require( 'commander' );

// ours
const { set, get } = require( '../lib/config' );

// config
const options = [ 'PROXY' ];

program
	.arguments( '<option>' )
	.action( ( option ) => {
		if ( option.indexOf( '=' ) < 0 ) {
			return console.error( 'Error: Invalid option argument provided. The argument must be in the format `name=value` (e.g. `PROXY=127.0.0.1:8080`)' );
		}

		const parts = option.split( '=' );
		const name = parts[0];
		const value = parts[1];

		if ( options.indexOf( name ) < 0 ) {
			return console.error( `Error: Invalid option name. Must be one of the following: ( '${ options.join( "', '" ) }' )` );
		}

		const config = {};
		config[name] = value;
		set( 'env', config, err => {
			if ( err ) {
				return console.error( `Error: Failed to save config for '${ name }': ${ err }` );
			}

			console.log( `Success: saved config for '${ name }'` ); 
		});
	});

program
	.command( 'show' )
	.description( 'Show configured options' )
	.action( ( err ) => {
		get( 'env', ( err, data ) => {
			if ( err ) {
				return console.error( `Error: Failed to parse config: ${ err }` );
			}

			console.log();
			for ( const [key, value] of Object.entries( data ) ) {
				console.log( `${ key }=${ value }` );
			}
			console.log();
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
