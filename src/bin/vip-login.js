#! /usr/bin/env node

var program = require('commander');
var promptly = require( 'promptly' );
var async    = require( 'async' );

// Ours
var utils = require( '../src/utils' );

program
	.parse( process.argv );

utils.getCredentials( ( err, user ) => {
	var userprompt = user && user.userId ? 'User ID (' + user.userId + '):' : 'User ID:';

	async.series({
		userId: promptly.prompt.bind( null, userprompt, { default: user && user.userId ? user.userId : null } ),
		accessToken: promptly.password.bind( null, 'Access Token:' )
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
});
