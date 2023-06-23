/**
 * External dependencies
 */
import Configstore from 'configstore';

/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Insecure implements Keychain {
	private file: string;
	private configstore: Configstore;

	constructor( file: string ) {
		this.file = file;

		this.configstore = new Configstore( this.file );
	}

	getPassword( service: string ): Promise< string | null > {
		try {
			const value: unknown = this.configstore.get( service );
			if ( null === value || undefined === value ) {
				return Promise.resolve( null );
			}

			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return Promise.resolve( value.toString() ); // NOSONAR
		} catch ( err ) {
			return Promise.reject( err );
		}
	}

	setPassword( service: string, password: string ): Promise< boolean > {
		try {
			this.configstore.set( service, password );
			return Promise.resolve( true );
		} catch ( err ) {
			return Promise.reject( err );
		}
	}

	deletePassword( service: string ): Promise< boolean > {
		try {
			this.configstore.delete( service );
			return Promise.resolve( true );
		} catch ( err ) {
			return Promise.reject( err );
		}
	}
}
