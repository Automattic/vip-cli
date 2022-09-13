/**
 * External dependencies
 */
const Configstore = require( 'configstore' );

/**
 * Internal dependencies
 */

export default class Insecure {
	file;

	constructor( file ) {
		this.file = file;

		this.configstore = new Configstore( this.file );
	}

	getPassword( service ) {
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

	setPassword( service, password ) {
		return new Promise( ( resolve, reject ) => {
			try {
				this.configstore.set( service, password );
			} catch ( err ) {
				return reject( err );
			}

			resolve( true );
		} );
	}

	deletePassword( service ) {
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
