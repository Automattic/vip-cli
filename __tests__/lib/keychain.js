
/**
 * Internal dependencies
 */
import Secure from 'lib/keychain/secure';
import Insecure from 'lib/keychain/insecure';
import Browser from 'lib/keychain/browser';

// TODO: Random bytes
const account = 'vip-cli-test';
const password = '12345';

describe( 'token tests (secure)', () => {
	const keychain = new Secure();

	test( 'should correctly set token', () => {
		return keychain.setPassword( account, password ).then( _ => {
			const p = keychain.getPassword( account );
			expect( p ).resolves.toBe( password );
		} );
	} );

	test( 'should correctly delete token', () => {
		return keychain.setPassword( account, password ).then( _ => {
			return keychain.deletePassword( account ).then( _ => {
				const p = keychain.getPassword( account );
				expect( p ).resolves.toBe( null );
			} );
		} );
	} );
} );
