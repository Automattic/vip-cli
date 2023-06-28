/**
 * External dependencies
 */
import keytar from '@postman/node-keytar';

/**
 * Internal dependencies
 */
import type { Keychain } from './keychain';

export default class Secure implements Keychain {
	getPassword( service: string ): Promise< string | null > {
		return keytar.getPassword( service, service );
	}

	async setPassword( service: string, password: string ): Promise< boolean > {
		await keytar.setPassword( service, service, password );
		return true;
	}

	deletePassword( service: string ): Promise< boolean > {
		return keytar.deletePassword( service, service );
	}
}
