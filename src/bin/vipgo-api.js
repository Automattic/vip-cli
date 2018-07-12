#!/usr/bin/env node

const program = require( 'commander' );
const querystring = require( 'querystring' );

// Ours
const api = require( '../lib/api' );

function parseData( d ) {
	try {
		return JSON.parse( d );
	} catch ( e ) {
		return querystring.parse( d );
	}
}

function log( data ) {
	if ( ! require( 'tty' ).isatty( 1 ) ) {
		console.log( JSON.stringify( data, null, '\t' ) );
	} else {
		console.log( data );
	}
}

program
	.command( 'GET <endpoint>' )
	.alias( 'get' )
	.description( 'Authenticated GET request' )
	.action( endpoint => {
		api
			.get( endpoint )
			.end( ( err, res ) => {
				log( res.body );
			});
	});

program
	.command( 'POST <endpoint>' )
	.alias( 'post' )
	.description( 'Authenticated POST request' )
	.option( '-d, --data <data>', 'Add data to the request body', parseData )
	.action( ( endpoint, options ) => {
		api
			.post( endpoint )
			.send( options.data )
			.end( ( err, res ) => {
				log( res.body );
			});
	});

program
	.command( 'PUT <endpoint>' )
	.alias( 'put' )
	.description( 'Authenticated PUT request' )
	.option( '-d, --data <data>', 'Add data to the request body', parseData )
	.action( ( endpoint, options ) => {
		api
			.put( endpoint )
			.send( options.data )
			.end( ( err, res ) => {
				log( res.body );
			});
	});

program
	.command( 'DELETE <endpoint>' )
	.alias( 'delete' )
	.description( 'Authenticated DELETE request' )
	.action( endpoint => {
		api
			.del( endpoint )
			.end( ( err, res ) => {
				log( res.body );
			});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
