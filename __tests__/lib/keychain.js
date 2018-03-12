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
	let keychain;
	try {
		keychain = new Secure();
	} catch( e ) {
		test.skip( 'should correctly set token (keytar does not exist)' );
		test.skip( 'should correctly delete token (keytar does not exist)' );
		return;
	}

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

describe( 'token tests (insecure)', () => {
	const keychain = new Insecure( 'vip-go-cli-test' );

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

describe( 'token tests (browser)', () => {
	global.window = {};
	const localStorage = require( 'mock-local-storage' );
	window.localStorage = global.localStorage;

	const keychain = new Browser();

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
