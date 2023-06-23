/**
 * External dependencies
 */
import { randomBytes } from 'crypto';

/**
 * Internal dependencies
 */
import Insecure from '../../src/lib/keychain/insecure';

const account = 'vip-cli-test';
const password = randomBytes( 256 ).toString();

describe( 'token tests (insecure)', () => {
	const keychain = new Insecure( account );

	it( 'should correctly set token', async () => {
		await keychain.setPassword( account, password );
		const passwd = keychain.getPassword( account );
		return expect( passwd ).resolves.toBe( password );
	} );

	it( 'should correctly set multiple tokens', async () => {
		const expected = [ 'password1', 'password2' ];
		await Promise.all( [
			keychain.setPassword( 'first', expected[ 0 ] ),
			keychain.setPassword( 'second', expected[ 1 ] ),
		] );

		const promise = Promise.all( [
			keychain.getPassword( 'first' ),
			keychain.getPassword( 'second' ),
		] );

		return expect( promise ).resolves.toEqual( expected );
	} );

	it( 'should correctly delete token', async () => {
		await keychain.setPassword( account, password );
		await keychain.deletePassword( account );

		const passwd = keychain.getPassword( account );
		return expect( passwd ).resolves.toBeNull();
	} );

	it( 'should correctly delete a single token', async () => {
		const expected = [ null, 'password2' ];

		await Promise.all( [
			keychain.setPassword( 'first', 'password1' ),
			keychain.setPassword( 'second', expected[ 1 ] ),
		] );

		await keychain.deletePassword( 'first' );

		const promise = Promise.all( [
			keychain.getPassword( 'first' ),
			keychain.getPassword( 'second' ),
		] );

		return expect( promise ).resolves.toEqual( expected );
	} );
} );
