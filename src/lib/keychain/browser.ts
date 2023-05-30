/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Secure implements Keychain {
	getPassword( service: string ): Promise<string | null> {
		return Promise.resolve( window.localStorage.getItem( service ) );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		try {
			window.localStorage.setItem( service, password );
			return Promise.resolve( true );
		} catch ( err ) {
			return Promise.resolve( false );
		}
	}

	deletePassword( service: string ): Promise<boolean> {
		window.localStorage.removeItem( service );
		return Promise.resolve( true );
	}
}
