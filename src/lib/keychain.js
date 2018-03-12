
/**
 * Internal dependencies
 */
import Insecure from './keychain/insecure';
import Browser from './keychain/browser';

let e = {};
if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	try {
		// secure
		const Secure = require( './keychain/secure' );
		e = new Secure();
	} catch ( _ ) {
		// insecure fallback
		e = new Insecure( 'vip-go-cli' );
	}
} else {
	e = new Browser();
}

module.exports = e;
