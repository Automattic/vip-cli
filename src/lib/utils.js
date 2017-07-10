const fs = require( 'fs' );
const crypto = require( 'crypto' );
const promptly = require( 'promptly' );
const vip = require( 'vip' );
const url = require( 'url' );
const path = require( 'path' );
const log = require( 'single-line-log' ).stderr;

var s_token_iv = 'XWRCbboGgpK1Q23c';
var s_token_ky = 'w3C1LwkexA8exKsjuYxRBCHOhqMZ5Wiy4mYPT4UxiJOvKNF7hSLwwt7dqpYyj3cA';

const config = require( './config' );

export function encrypt( data, key ) {
	var cryptkey = crypto.createHash( 'sha256' ).update( key + s_token_ky + key ).digest();
	var encipher = crypto.createCipheriv( 'aes-256-cbc', cryptkey, s_token_iv );
	var encryptdata = encipher.update( data, 'utf8', 'binary' );
	encryptdata += encipher.final( 'binary' );
	var encoded = new Buffer( encryptdata, 'binary' ).toString( 'base64' );
	return encoded;
}

export function decrypt( data, key ) {
	var cryptkey = crypto.createHash( 'sha256' ).update( key + s_token_ky + key ).digest();
	var decipher = crypto.createDecipheriv( 'aes-256-cbc', cryptkey, s_token_iv );
	var encr_data = new Buffer( data, 'base64' ).toString( 'binary' );
	var decoded = decipher.update( encr_data, 'binary', 'utf8' );
	decoded += decipher.final( 'utf8' );
	return decoded;
}

export function deleteCredentials() {
	config.del( 'login' );
}

export function setCredentials( credentials, callback ) {
	credentials.userId = credentials.userId || '';
	credentials.accessToken = credentials.accessToken || '';

	const api = new vip();

	api.auth.apiUserId = credentials.userId;
	api.auth.token = credentials.accessToken;

	api
		.get( '/api_users/' + api.auth.apiUserId )
		.end( ( err, res ) => {
			if ( err ) {
				return callback( err );
			}

			credentials.role = res.body.data[0].api_user_role_id;
			credentials.caps = res.body.data[0].caps;

			var encoded = this.encrypt( credentials.accessToken, credentials.userId );
			credentials.accessToken = encoded;

			config.set( 'login', credentials, err => callback( err, credentials ) );
		});
}

export function getCredentials( callback ) {
	config.get( 'login', function( err, r ) {
		if ( err ) {
			return callback( 'Could not get credentials' );
		}

		if ( ! r.accessToken ) {
			console.error( 'no access token' );
			return callback( 'Invalid login credentials' );
		}

		try {
			var decoded = decrypt( r.accessToken, r.userId );
		} catch ( e ) {
			config.del( 'login' );
			return callback( 'Could not decrypt credentials' );
		}

		r.accessToken = decoded;
		return callback( null, r );
	});
}

export function findSite( domain, cb ) {
	var request, api = require( './api' );
	if ( ! isNaN( parseInt( domain ) ) ) {
		request = api
			.get( '/sites/' + domain );
	} else {
		var u = url.parse( domain );
		request = api
			.get( '/sites' )
			.query({ domain_name: u.host || domain });
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
}

export function findAndConfirmSite( site, action, cb ) {
	findSite( site, ( err, s ) => {
		if ( err ) {
			return cb( err );
		}

		if ( ! s ) {
			return cb( new Error( "Couldn't find site:" + site ) );
		}

		displayNotice( [
			action,
			`-- Site: ${ s.domain_name } (#${ s.client_site_id })`,
			'-- Environment: ' + s.environment_name,
		] );

		promptly.confirm( 'Are you sure? (y/n)', { output: process.stderr }, ( err, yes ) => {
			if ( err ) {
				return cb( err );
			}

			if ( ! yes ) {
				// Bails. Do not pass go. Do not collect $200.
				return;
			}

			cb( null, s );
		});
	});
}

export function mkdirp( dir ) {
	var parent = path.dirname( dir );

	try {
		fs.statSync( dir );
	} catch ( e ) {
		mkdirp( parent );
		fs.mkdirSync( dir );
	}
}

export function displayNotice( notice ) {
	if ( ! Array.isArray( notice ) ) {
		notice = [ notice ];
	}

	console.error( '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-' );
	notice.forEach( msg => console.error( msg ) );
	console.error( '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-' );
}

let loadingIndex = 0;
const loadingSprite = [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ];
export function showLoading( msg ) {
	if ( loadingIndex >= loadingSprite.length ) {
		loadingIndex = 0;
	}
	const loading = loadingSprite[ loadingIndex ];
	loadingIndex++;

	log( `${ msg } ${ loading }\n` );
}

export function maybeConfirm( prompt, doPrompt, cb ) {
	if ( doPrompt ) {
		return promptly.confirm( prompt + ' (y/n)', { output: process.stderr }, cb );
	}

	cb( null, true );
}
