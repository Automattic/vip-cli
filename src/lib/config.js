const fs = require( 'fs' );

const dir = require( 'os' ).homedir() + '/.vip-cli';

export function get( file, callback ) {
	try {
		var data = fs.readFileSync( dir + '/' + file, 'utf8' );
	} catch (e) {
		return callback( e );
	}

	data = JSON.parse( data );
	return callback( null, data );
}

export function set( file, update = {}, callback ) {
	callback = callback || function() {};

	fs.readFile( dir + '/' + file, ( err, data ) => {
		if ( err ) {
			data = {}
		} else {
			data = JSON.parse( data )
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
