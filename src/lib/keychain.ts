/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import Insecure from './keychain/insecure';
import type { Keychain, KeychainConstructor } from './keychain/keychain';

let exportValue: Keychain;
const debug = debugLib( '@automattic/vip:keychain' );

try {
	// Try using Secure keychain ("keytar") first
	const Secure = require( './keychain/secure' ) as KeychainConstructor;
	exportValue = new Secure();
} catch ( error ) {
	debug( 'Cannot use Secure keychain; falling back to Insecure keychain (Details: %o)', error );

	// Fallback to Insecure keychain if we can't
	exportValue = new Insecure( 'vip-go-cli' );
}

export default exportValue;
