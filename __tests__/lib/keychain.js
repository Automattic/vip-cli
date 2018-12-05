/**
 * External dependencies
 */
import { randomBytes } from 'crypto';

/**
 * Internal dependencies
 */
import Insecure from 'lib/keychain/insecure';
import Browser from 'lib/keychain/browser';

// TODO: Random bytes
const account = 'vip-cli-test';
const password = randomBytes( 256 ).toString();

let keychain;

describe( 'token tests (secure)', () => {
	try {
		const Secure = require( 'lib/keychain/secure' );
		keychain = new Secure();
	} catch ( e ) {
		test.skip( 'should correctly set token (keytar does not exist)', () => {} );
		test.skip( 'should correctly delete token (keytar does not exist)', () => {} );
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
	keychain = new Insecure( account );

	test( 'should correctly set token', () => {
		return keychain.setPassword( account, password ).then( _ => {
			const p = keychain.getPassword( account );
			expect( p ).resolves.toBe( password );
		} );
	} );

	test( 'should correctly set multiple tokens', () => {
		return keychain.setPassword( 'first', 'password1' ).then( _ => {
			return keychain.setPassword( 'second', 'password2' ).then( _ => {
				const p = keychain.getPassword( 'first' );
				expect( p ).resolves.toBe( 'password1' );

				const p2 = keychain.getPassword( 'second' );
				expect( p2 ).resolves.toBe( 'password2' );
			} );
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

	test( 'should correctly delete a single token', () => {
		return keychain.setPassword( 'first', 'password1' ).then( _ => {
			return keychain.setPassword( 'second', 'password2' ).then( _ => {
				return keychain.deletePassword( 'first' ).then( _ => {
					const p = keychain.getPassword( 'first' );
					expect( p ).resolves.toBe( null );

					const p2 = keychain.getPassword( 'second' );
					expect( p2 ).resolves.toBe( 'password2' );
				} );
			} );
		} );
	} );
} );

describe( 'token tests (browser)', () => {
	global.window = {};
	const localStorage = require( 'mock-local-storage' );
	window.localStorage = global.localStorage;

	keychain = new Browser();

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
