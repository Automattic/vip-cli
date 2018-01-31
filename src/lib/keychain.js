module.exports = {};

if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	const fs = require( 'fs' );
	const os = require( 'os' );

	// read-only perms
	const rw = 0o600;

	let stat;
	const file = os.tmpdir() + '/vip-go-cli';
	try {
		// Ensure the file exists
		stat = fs.statSync( file );
	} catch ( e ) {
		const fd = fs.openSync( file, 'w+', rw );
		fs.closeSync( fd );
		stat = fs.statSync( file );
	}

	// Get file perms (last 3 bits of stat.mode)
	const perms = stat.mode & 0o777;

	// Ensure permissions are what we expect
	if ( !! ( perms & ~rw ) ) {
		throw 'Invalid permissions on access token file: ' + file;
	}

	module.exports.setPassword = function( service, password ) {
		return fs.writeFileSync( file, password );
	};

	module.exports.getPassword = function( service ) {
		return fs.readFileSync( file, 'utf8' );
	};

	module.exports.deletePassword = function( service ) {
		return fs.unlinkSync( file );
	};
} else {
	// browser

	module.exports.setPassword = function( service, password ) {
		return window.localStorage.setItem( service, password );
	};

	module.exports.getPassword = function( service ) {
		return window.localStorage.getItem( service );
	};

	module.exports.deletePassword = function( service ) {
		return window.localStorage.removeItem( service );
	};
}
