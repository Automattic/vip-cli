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
		const rw = fs.constants.S_IRUSR | fs.constants.S_IWUSR;

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

		// Check only the current user can access the file
		// File is not read/write/executable globally or by the group
		if ( !! ( stat.mode & ( fs.constants.S_IRWXG | fs.constants.S_IRWXO ) ) ) {
			throw `Invalid permissions (${ stat.mode.toString( 8 ) }, expecting ${ rw.toString( 8 ) }) for keychain file (${ tmpfile })`;
		}

		this.file = tmpfile;
	}

	getPassword( service: string ): Promise<string> {
		if ( this.passwords && this.passwords[ service ] ) {
			return Promise.resolve( this.passwords[ service ] );
		}

		return new Promise( ( resolve, reject ) => {
			fs.readFile( this.file, 'utf8', ( err, passwords ) => {
				if ( err || ! passwords ) {
					return resolve( null );
				}

				try {
					this.passwords = JSON.parse( passwords );
				} catch ( e ) {
					return reject( e );
				}

				return resolve( passwords[ service ] );
			} );
		} );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		this.passwords[ service ] = password;

		return new Promise( ( resolve, reject ) => {
			let json;

			try {
				json = JSON.stringify( this.passwords );
			} catch ( e ) {
				return reject( e );
			}

			fs.writeFile( this.file, json, err => resolve( ! err ) );
		} );
	}

	deletePassword( service: string ): Promise<boolean> {
		delete this.passwords[ service ];

		return new Promise( ( resolve, reject ) => {
			let json;

			try {
				json = JSON.stringify( this.passwords );
			} catch ( e ) {
				return reject( e );
			}

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
