
/**
 * Internal dependencies
 */
import Insecure from './keychain/insecure';
import Browser from './keychain/browser';

let e = {};
if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	try {
		// secure
		const Secure = require( './keychain/secure' );
		e = new Secure();
	} catch ( _ ) {
		// insecure fallback

		const fs = require( 'fs' );
		const os = require( 'os' );

		// only current user has read-write access
		const rw = 0o600;

		let stat;
		const file = os.tmpdir() + '/vip-go-cli';
		try {
			// Ensure the file exists
			stat = fs.statSync( file );
		} catch ( __ ) {
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

		e = new Insecure( file );
	}
} else {
	e = new Browser();
}

module.exports = e;
