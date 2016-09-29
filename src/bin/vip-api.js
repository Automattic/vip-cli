#!/usr/bin/env node

var program = require( 'commander' );
var querystring = require('querystring');

// Ours
var api = require( '../src/api' );

function parseData(d) {
	try {
		return JSON.parse(d);
	} catch (e) {
		return querystring.parse(d);
	}
}

program
	.command( 'GET <endpoint>' )
	.description( 'Authenticated GET request' )
	.action( endpoint => {
		api
			.get(endpoint)
			.end( (err, res) => {
				console.log(JSON.stringify(res.body, null, "\t"));
			});
	});

program
	.command( 'POST <endpoint>' )
	.description( 'Authenticated POST request' )
	.option( '-d, --data <data>', 'Add data to the request body', parseData )
	.action( (endpoint, options) => {
		api
			.post(endpoint)
			.send(options.data)
			.end( (err, res) => {
				console.log(JSON.stringify(res.body, null, "\t"));
			});
	});

program
	.command( 'PUT <endpoint>' )
	.description( 'Authenticated PUT request' )
	.option( '-d, --data <data>', 'Add data to the request body', parseData )
	.action( (endpoint, options) => {
		api
			.put(endpoint)
			.send(options.data)
			.end( (err, res) => {
				console.log(JSON.stringify(res.body, null, "\t"));
			});
	});

program
	.command( 'DELETE <endpoint>' )
	.description( 'Authenticated DELETE request' )
	.action( endpoint => {
		api
			.del(endpoint)
			.end( (err, res) => {
				console.log(JSON.stringify(res.body, null, "\t"));
			});
	});

program.parse( process.argv );

if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
