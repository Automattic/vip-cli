// @flow

/**
 * External dependencies
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Insecure implements Keychain {
	file: string;

	constructor( file: string ) {
		// only current user has read-write access
		const rw = 0o600;

		let stat;
		const tmpfile = os.tmpdir() + path.sep + file;
		try {
			// Ensure the file exists
			stat = fs.statSync( tmpfile );
		} catch ( _ ) {
			const fd = fs.openSync( tmpfile, 'w+', rw );
			fs.closeSync( fd );
			stat = fs.statSync( tmpfile );
		}

		// Get file perms (last 3 bits of stat.mode)
		const perms = stat.mode & 0o777;

		// Ensure permissions are what we expect
		if ( !! ( perms & ~rw ) ) {
			throw 'Invalid permissions on access token file: ' + tmpfile;
		}

		this.file = tmpfile;
	}

	getPassword( service: string ): Promise<string> {
		return new Promise( resolve => {
			fs.readFile( this.file, 'utf8', ( err, password ) => {
				if ( err || ! password ) {
					return resolve( null );
				}

				return resolve( password );
			} );
		} );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		return new Promise( resolve => {
			fs.writeFile( this.file, password, err => resolve( ! err ) );
		} );
	}

	deletePassword( service: string ): Promise<boolean> {
		return new Promise( resolve => {
			fs.unlink( this.file, err => resolve( ! err ) );
		} );
	}
}
