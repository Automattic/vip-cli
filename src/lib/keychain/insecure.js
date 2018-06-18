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
	passwords: Object;

	constructor( file: string ) {
		// only current user has read-write access
		const rw = 0o600;

		let stat;
		const dir = os.homedir() + path.sep + '.vip';
		this.mkdirp( dir );

		const tmpfile = dir + path.sep + file;
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
			throw `Invalid permissions (${ perms.toString( 8 ) }, expecting ${ rw.toString( 8 ) }) for keychain file (${ tmpfile })`;
		}

		this.file = tmpfile;
	}

	getPassword( service: string ): Promise<string> {
		if ( this.passwords && this.passwords[ service ] ) {
			return Promise.resolve( this.passwords[ service ] );
		}

		return new Promise( resolve => {
			fs.readFile( this.file, 'utf8', ( err, passwords ) => {
				if ( err || ! passwords ) {
					return resolve( null );
				}

				this.passwords = JSON.parse( passwords );

				return resolve( passwords[ service ] );
			} );
		} );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		this.passwords[ service ] = password;

		return new Promise( resolve => {
			const json = JSON.stringify( this.passwords );
			fs.writeFile( this.file, json, err => resolve( ! err ) );
		} );
	}

	deletePassword( service: string ): Promise<boolean> {
		delete this.passwords[ service ];

		return new Promise( resolve => {
			const json = JSON.stringify( this.passwords );
			fs.writeFile( this.file, json, err => resolve( ! err ) );
		} );
	}

	mkdirp( dir ) {
		const parent = path.dirname( dir );

		try {
			fs.statSync( dir );
		} catch ( e ) {
			this.mkdirp( parent );
			fs.mkdirSync( dir );
		}
	}
}
