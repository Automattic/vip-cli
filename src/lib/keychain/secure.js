const keytar = require( 'keytar' );

/**
 * internal dependencies
 */
const Keychain = require( './keychain' );

module.exports = class Secure implements Keychain {
	getPassword( service ) {
		return keytar.getPassword( service, service );
	}

	setPassword( service, password ) {
		return keytar.setPassword( service, service, password );
	}

	deletePassword( service ) {
		return keytar.deletePassword( service, service );
	}
};
