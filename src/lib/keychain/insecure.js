// @flow

/**
 * External dependencies
 */
const Configstore = require( 'configstore' );

/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Insecure implements Keychain {
	file: string;

	constructor( file: string ) {
		this.file = file;

		this.configstore = new Configstore( this.file );
	}

	getPassword( service: string ): Promise<string> {
		return new Promise( ( resolve, reject ) => {
			let password = null;

			try {
				password = this.configstore.get( service );
			} catch ( err ) {
				return reject( err );
			}

			return resolve( password );
		} );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		return new Promise( ( resolve, reject ) => {
			try {
				this.configstore.set( service, password );
			} catch ( err ) {
				return reject( err );
			}

			resolve( true );
		} );
	}

	deletePassword( service: string ): Promise<boolean> {
		return new Promise( ( resolve, reject ) => {
			try {
				this.configstore.delete( service );
			} catch ( err ) {
				return reject( err );
			}
			resolve( true );
		} );
	}
}
