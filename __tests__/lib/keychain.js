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
	it( 'should correctly set token', () => {
		return keychain.setPassword( account, password ).then( async () => {
			const passwd = keychain.getPassword( account );
			await expect( passwd ).resolves.toBe( password );
		} );
	} );

	it( 'should correctly delete token', () => {
		return keychain.setPassword( account, password ).then( () => {
			return keychain.deletePassword( account ).then( async () => {
				const passwd = keychain.getPassword( account );
				await expect( passwd ).resolves.toBeNull();
			} );
		} );
	} );
} );

describe( 'token tests (insecure)', () => {
	keychain = new Insecure( account );

	it( 'should correctly set token', () => {
		return keychain.setPassword( account, password ).then( async () => {
			const passwd = keychain.getPassword( account );
			await expect( passwd ).resolves.toBe( password );
		} );
	} );

	it( 'should correctly set multiple tokens', () => {
		return keychain.setPassword( 'first', 'password1' ).then( () => {
			return keychain.setPassword( 'second', 'password2' ).then( async () => {
				const passwd = keychain.getPassword( 'first' );
				await expect( passwd ).resolves.toBe( 'password1' );

				const passwd2 = keychain.getPassword( 'second' );
				await expect( passwd2 ).resolves.toBe( 'password2' );
			} );
		} );
	} );

	it( 'should correctly delete token', () => {
		return keychain.setPassword( account, password ).then( () => {
			return keychain.deletePassword( account ).then( async () => {
				const passwd = keychain.getPassword( account );
				await expect( passwd ).resolves.toBeNull();
			} );
		} );
	} );

	it( 'should correctly delete a single token', () => {
		return keychain.setPassword( 'first', 'password1' ).then( () => {
			return keychain.setPassword( 'second', 'password2' ).then( () => {
				return keychain.deletePassword( 'first' ).then( async () => {
					const passwd = keychain.getPassword( 'first' );
					await expect( passwd ).resolves.toBeNull();

					const passwd2 = keychain.getPassword( 'second' );
					await expect( passwd2 ).resolves.toBe( 'password2' );
				} );
			} );
		} );
	} );
} );

describe( 'token tests (browser)', () => {
	// mock localStorage
	global.localStorage = {
		data: {},
		getItem( key ) {
			return this.data[ key ];
		},
		setItem( key, value ) {
			this.data[ key ] = value;
		},
		removeItem( key ) {
			delete this.data[ key ];
		},
	};

	keychain = new Browser();

	it( 'should correctly set token', () => {
		return keychain.setPassword( account, password ).then( async () => {
			const passwd = keychain.getPassword( account );
			await expect( passwd ).resolves.toBe( password );
		} );
	} );

	it( 'should correctly delete token', () => {
		return keychain.setPassword( account, password ).then( () => {
			return keychain.deletePassword( account ).then( async () => {
				const passwd = keychain.getPassword( account );
				await expect( passwd ).resolves.toBeNull();
			} );
		} );
	} );
} );
