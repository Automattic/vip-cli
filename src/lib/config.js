const fs = require( 'fs' );

const dir = require( 'os' ).homedir() + '/.vip-cli';

export function get( file, callback ) {
	let data = {};

	try {
		data = fs.readFileSync( dir + '/' + file, 'utf8' );
	} catch (e) {
		return callback( e );
	}

	try {
		data = JSON.parse( data );
	} catch (e) {
		if ( e.name === 'SyntaxError' ) {
			return callback( null, {} );
		}
		return callback( e );
	}

	return callback( null, data );
}

export function set( file, update = {}, callback ) {
	callback = callback || function() {};

	get( file, ( err, data ) => {
		if ( err ) {
			data = {}
		}

		data = Object.assign( data, update );

		const utils = require( './utils' );
		utils.mkdirp( dir );
		fs.writeFile( dir + '/' + file, JSON.stringify( data ), callback );
	});
}

export function del( file, callback ) {
	callback = callback || function() {};

	try {
		fs.unlink( dir + '/' + file, callback );
	} catch( e ) {
		callback( e );
	}
}
