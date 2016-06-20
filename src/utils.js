const fs = require( 'fs' );
const crypto = require( 'crypto' );

var s_token_iv = 'XWRCbboGgpK1Q23c';
var s_token_ky = 'w3C1LwkexA8exKsjuYxRBCHOhqMZ5Wiy4mYPT4UxiJOvKNF7hSLwwt7dqpYyj3cA';

var utils = {
	setCredentials: function( credentials, callback ) {
		credentials.userId      = credentials.userId || '';
		credentials.accessToken = credentials.accessToken || '';

		var cryptkey = crypto.createHash( 'sha256' ).update( credentials.userId + s_token_ky + credentials.userId ).digest();
		var encipher = crypto.createCipheriv( 'aes-256-cbc', cryptkey, s_token_iv );
		var encryptdata = encipher.update( credentials.accessToken, 'utf8', 'binary' );
		encryptdata += encipher.final( 'binary' );
		var encoded = new Buffer( encryptdata, 'binary' ).toString( 'base64' );

		credentials.accessToken = encoded;

		var credentials = JSON.stringify( credentials );
		fs.writeFileSync('/tmp/.vip-go-api', credentials );

		return callback( null, credentials );
	},
	getCredentials: function( callback ){
		try {
			var r = fs.readFileSync( '/tmp/.vip-go-api', 'utf8' );
		} catch (e) {
			return callback( 'Could not get credentials' );
		}

		r = JSON.parse( r );

		if ( ! r.accessToken ) {
			return;
		}

		try {
			var cryptkey = crypto.createHash( 'sha256' ).update( r.userId + s_token_ky + r.userId ).digest();
			var decipher = crypto.createDecipheriv( 'aes-256-cbc', cryptkey, s_token_iv );
			var encr_data = new Buffer( r.accessToken, 'base64' ).toString( 'binary' );
			var decoded = decipher.update( encr_data, 'binary', 'utf8' );
			decoded += decipher.final( 'utf8' );
		} catch (e) {
			fs.unlinkSync( '/tmp/.vip-go-api' );
		}

		r.accessToken = decoded;

		return callback( null, r );
	},
	findSite: function( domain, cb ) {
		var api = require( './api' );

		var site;
		if ( ! isNaN( parseInt( domain ) ) ) {
			return api
				.get( '/sites/' + domain )
				.query({ pagesize: 1 })
				.end( ( err, res ) => {
					if ( err ) {
						return console.error( err.response.error );
					}

					site = res.body.data[0];

					if ( ! site ) {
						return console.error( "Couldn't find site:", domain );
					}

					console.log( "Client Site:", site.client_site_id );
					console.log( "Primary Domain:", site.domain_name );
					console.log( "Environment:", site.environment_name );
					cb( site );
				});
		}

		return api
			.get( '/sites' )
			.query({ search: domain })
			.query({ pagesize: 1 })
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				site = res.body.data[0];

				if ( ! site ) {
					return cb();
				}

				cb( site );
			});
	},
};

module.exports = utils;
