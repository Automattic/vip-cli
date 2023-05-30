/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import Insecure from './keychain/insecure';
import Browser from './keychain/browser';
import type { Keychain } from './keychain/keychain';

let exportValue: Keychain;
if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	const debug = debugLib( '@automattic/vip:keychain' );

	try {
		// Try using Secure keychain ("keytar") first
		const Secure = require( './keychain/secure' ) as Keychain & (new() => Keychain);
		exportValue = new Secure();
	} catch ( error ) {
		debug( 'Cannot use Secure keychain; falling back to Insecure keychain (Details: %o)', error );

		// Fallback to Insecure keychain if we can't
		exportValue = new Insecure( 'vip-go-cli' );
	}
} else {
	exportValue = new Browser();
}

export default exportValue;
