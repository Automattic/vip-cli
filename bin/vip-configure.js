#! /usr/bin/env node

var program = require('commander');

var async    = require( 'async' );
var promptly = require( 'promptly' );

var utils = require( '../src/utils' );

program
	.parse( process.argv );

async.series({
	userId: promptly.prompt.bind( null, 'User ID:' ),
	accessToken: promptly.prompt.bind( null, 'Access Token: ' )
}, function( err, results ) {
	if ( err ) {
		return console.log( 'Error: ', err );
	}

	var credentials = {
		userId:      results.userId,
		accessToken: results.accessToken
	};

	utils.setCredentials( credentials , function( err ) {
		if ( err ) {
			return console.log( 'Error setting credentials: ', err );
		}

		return console.log( 'Configuration successful' );
	});
});
