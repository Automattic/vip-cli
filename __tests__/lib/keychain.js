import { randomBytes } from 'crypto';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const account = 'vip-cli-test';
const password = randomBytes( 256 ).toString();

describe( 'token tests (insecure)', () => {
	let keychain;
	let root;
	let previousConfigHome;

	beforeEach( () => {
		root = mkdtempSync( path.join( tmpdir(), 'vip-keychain-test-' ) );
		const configHome = path.join( root, 'config' );
		mkdirSync( configHome );
		writeFileSync( path.join( root, 'sentinel' ), 'unchanged' );
		previousConfigHome = process.env.XDG_CONFIG_HOME;
		process.env.XDG_CONFIG_HOME = configHome;
		jest.isolateModules( () => {
			const { Insecure } = require( '../../src/lib/keychain/insecure' );
			keychain = new Insecure( account );
		} );
		assert.equal(
			keychain.configstore.path,
			path.join( configHome, 'configstore', `${ account }.json` )
		);
	} );

	afterEach( () => {
		try {
			assert.equal( readFileSync( path.join( root, 'sentinel' ), 'utf8' ), 'unchanged' );
		} finally {
			if ( previousConfigHome === undefined ) delete process.env.XDG_CONFIG_HOME;
			else process.env.XDG_CONFIG_HOME = previousConfigHome;
			rmSync( root, { recursive: true, force: true } );
		}
	} );

	it( 'should correctly set token', async () => {
		await keychain.setPassword( account, password );
		expect(
			readFileSync( path.join( root, 'config', 'configstore', `${ account }.json` ), 'utf8' )
		).toContain( account );
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

	it( 'does not touch neighboring data when storage fails', async () => {
		const configHome = path.join( root, 'config' );
		rmSync( configHome, { recursive: true, force: true } );
		writeFileSync( configHome, 'not a directory' );
		await expect( keychain.setPassword( 'test', 'value' ) ).rejects.toThrow();
		expect( readFileSync( path.join( root, 'sentinel' ), 'utf8' ) ).toBe( 'unchanged' );
	} );
} );
