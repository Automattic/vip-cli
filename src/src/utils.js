const fs = require( 'fs' );
const crypto = require( 'crypto' );
const promptly = require( 'promptly' );

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
		var request, api = require( './api' );
		if ( ! isNaN( parseInt( domain ) ) ) {
			request = api
				.get( '/sites/' + domain );
		} else {
			request = api
				.get( '/sites' )
				.query({ search: domain });
		}

		return request
			.query({ pagesize: 1 })
			.end( ( err, res ) => {
				if ( err ) {
					return cb( err.response.error );
				}

				var site = res.body.data[0];

				if ( ! site ) {
					return cb();
				}

				cb( null, site );
			});
	},
	findAndConfirmSite: function( site, cb ) {
		utils.findSite( site, ( err, s ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! s ) {
				return console.error( "Couldn't find site:", site );
			}

			console.log( "Client Site:", s.client_site_id );
			console.log( "Primary Domain:", s.domain_name );
			console.log( "Environment:", s.environment_name );

			promptly.confirm( "Are you sure?", ( err, yes ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! yes ) {
					// Bails. Do not pass go. Do not collect $200.
					return;
				}

				cb( s );
			});
		});
	},
};

module.exports = utils;
