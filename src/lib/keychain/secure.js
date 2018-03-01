
/**
 * External dependencies
 */
import keytar from 'keytar';

/**
 * Internal dependencies
 */
import Keychain from './keychain';

export default class Secure implements Keychain {
	getPassword( service ) {
		return keytar.getPassword( service, service );
	}

	setPassword( service, password ) {
		return keytar.setPassword( service, service, password );
	}

	deletePassword( service ) {
		return keytar.deletePassword( service, service );
	}
}
