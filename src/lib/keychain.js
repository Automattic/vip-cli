
/**
 * External dependencies
 */
const debug = require( 'debug' )( '@automattic/vip:keychain' );

/**
 * Internal dependencies
 */
import Insecure from './keychain/insecure';
import Browser from './keychain/browser';

let e = {};
if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	try {
		// Try using Secure keychain ("keytar") first
		const Secure = require( './keychain/secure' );
		e = new Secure();
	} catch ( error ) {
		debug( 'Cannot use Secure keychain; falling back to Insecure keychain (Details: %o)', error );

		// Fallback to Insecure keychain if we can't 
		e = new Insecure( 'vip-go-cli' );
	}
} else {
	e = new Browser();
}

module.exports = e;
