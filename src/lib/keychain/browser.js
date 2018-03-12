// @flow

/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Secure implements Keychain {
	getPassword( service: string ): Promise<string> {
		return new Promise( resolve => {
			const password = window.localStorage.getItem( service );
			return resolve( password );
		} );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		return new Promise( resolve => {
			const set = !! window.localStorage.setItem( service, password );
			return resolve( set );
		} );
	}

	deletePassword( service: string ): Promise<boolean> {
		return new Promise( resolve => {
			const del = !! window.localStorage.removeItem( service );
			return resolve( del );
		} );
	}
}
