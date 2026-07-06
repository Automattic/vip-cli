import debugLib from 'debug';

import { Insecure } from './keychain/insecure';

import type { Keychain } from './keychain/keychain';

let keychain: Keychain;
const debug = debugLib( '@automattic/vip:keychain' );

export async function getKeychain(): Promise< Keychain > {
	if ( typeof keychain === 'undefined' ) {
		try {
			const { Secure } = await import( './keychain/secure.js' );
			const kc = new Secure();
			// We don't know if the secure keychain is actually usable until we try to communicate with it.
			await kc.getPassword( 'non-existent-password-fraude-perit-virtus' );
			debug( 'Using Secure keychain' );
			keychain = kc;
		} catch ( error ) {
			debug( 'Cannot use Secure keychain; falling back to Insecure keychain (Details: %o)', error );
			keychain = new Insecure( 'vip-go-cli' );
		}
	}

	return keychain;
}
