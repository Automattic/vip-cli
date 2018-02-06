// @flow

const e = {};
if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	try {
		// secure

		const keytar = require( 'keytar' );

		e.setPassword = async function( service: string, password: string ): Promise<boolean> {
			return keytar.setPassword( service, service, password );
		};

		e.getPassword = async function( service: string ): Promise<string> {
			return keytar.getPassword( service, service );
		};

		e.deletePassword = async function( service: string ): Promise<boolean> {
			return keytar.deletePassword( service, service );
		};
	} catch ( _ ) {
		// insecure fallback

		const fs = require( 'fs' );
		const os = require( 'os' );

		// read-only perms
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

		e.setPassword = async function( service: string, password: string ): Promise<boolean> {
			return new Promise( resolve => {
				fs.writeFile( file, password, err => resolve( ! err ) );
			} );
		};

		e.getPassword = async function( service: string ): Promise<string> {
			return new Promise( resolve => {
				fs.readFile( file, 'utf8', ( err, password ) => resolve( password ) );
			} );
		};

		e.deletePassword = async function( service: string ): Promise<boolean> {
			return new Promise( resolve => {
				fs.unlink( file, err => resolve( ! err ) );
			} );
		};
	}
} else {
	// browser

	e.setPassword = async function( service: string, password: string ): Promise<boolean> {
		return window.localStorage.setItem( service, password );
	};

	e.getPassword = async function( service: string ): Promise<string> {
		return window.localStorage.getItem( service );
	};

	e.deletePassword = async function( service: string ): Promise<boolean> {
		return window.localStorage.removeItem( service );
	};
}

module.exports = e;
