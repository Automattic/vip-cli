// @flow

const keytar = require( 'keytar' );

/**
 * internal dependencies
 */
import type { Keychain } from './keychain';

module.exports = class Secure implements Keychain {
	getPassword( service: string ): Promise<string> {
		return keytar.getPassword( service, service );
	}

	setPassword( service: string, password: string ): Promise<boolean> {
		return keytar.setPassword( service, service, password );
	}

	deletePassword( service: string ): Promise<boolean> {
		return keytar.deletePassword( service, service );
	}
};
