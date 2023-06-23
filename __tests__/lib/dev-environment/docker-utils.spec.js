/**
 * External dependencies
 */
import path from 'node:path';
import { homedir, platform } from 'node:os';
import { promises, readFileSync } from 'node:fs';
import {
	getDockerSocket,
	getEngineConfig,
	splitca,
} from '../../../src/lib/dev-environment/docker-utils';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe( 'splitca', () => {
	const base = path.join( __dirname, '..', '..', '..', '__fixtures__', 'certs' );
	const emptyFile = path.join( base, 'empty.ca' );
	const unreadableFile = path.join( base, 'unreadable.ca' );
	const garbageFile = path.join( base, 'garbage.ca' );
	const ca0file = path.join( base, 'split0.ca' );
	const ca1file = path.join( base, 'split1.ca' );
	const caBundleFile = path.join( base, 'test-chain.bundle' );

	const ca0 = readFileSync( ca0file, 'utf8' ).toString().replace( /\n$/, '' );
	const ca1 = readFileSync( ca1file, 'utf8' ).toString().replace( /\n$/, '' );

	describe( 'multiple CA chain', () => {
		it( 'should return an array of CA chain strings', async () => {
			const split = await splitca( caBundleFile );
			expect( split ).toEqual( expect.any( Array ) );
			expect( split ).toEqual( expect.arrayContaining( [ ca0, ca1 ] ) );
		} );
	} );

	describe( 'single CA chain', () => {
		it( 'should return an array of one CA string', async () => {
			const split = await splitca( ca1file );
			expect( split ).toEqual( expect.any( Array ) );
			expect( split ).toContain( ca1 );
			expect( split ).not.toContain( ca0 );
		} );
	} );

	describe( 'empty file', () => {
		it( 'should throw a bad file error', () =>
			expect( () => splitca( emptyFile ) ).rejects.toThrow() );
	} );

	describe( 'directory instead of file', () => {
		it( 'should throw a bad file error', () =>
			expect( () => splitca( unreadableFile ) ).rejects.toThrow() );
	} );

	describe( 'garbage file', () => {
		it( 'should throw a bad file error', () =>
			expect( () => splitca( garbageFile ) ).rejects.toThrow() );
	} );
} );

if ( platform() !== 'win32' ) {
	describe( 'getDockerSocket', () => {
		const env = { ...process.env };
		afterEach( () => {
			process.env = env;
			jest.restoreAllMocks();
		} );

		it( 'should do nothing for non-UNIX sockets', () => {
			const socketPath = 'tcp://127.0.0.1:2306';
			process.env = { DOCKER_HOST: socketPath };
			return expect( getDockerSocket() ).resolves.toBe( socketPath );
		} );

		it( 'should try /var/run/docker.sock if DOCKER_HOST is not set', () => {
			const expectedPath = '/var/run/docker.sock';
			jest.spyOn( promises, 'stat' ).mockResolvedValueOnce( { isSocket: () => true } );
			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = {};
			return expect( getDockerSocket() ).resolves.toBe( expectedPath );
		} );

		it( 'should try ~/.docker/run/docker.sock if /var/run/docker.sock is unavailable', () => {
			const expectedPath = path.join( homedir(), '.docker', 'run', 'docker.sock' );

			jest.spyOn( promises, 'stat' ).mockImplementation( fpath => {
				if ( fpath !== expectedPath ) {
					throw new Error( 'ENOENT' );
				}
				return { isSocket: () => true };
			} );

			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = {};
			return expect( getDockerSocket() ).resolves.toBe( expectedPath );
		} );

		it( 'should return null if everything fails (stat)', () => {
			jest.spyOn( promises, 'stat' ).mockRejectedValue( new Error( 'ENOENT' ) );
			process.env = {};
			return expect( getDockerSocket() ).resolves.toBeNull();
		} );

		it( 'should return null if everything fails (access)', () => {
			jest.spyOn( promises, 'stat' ).mockResolvedValueOnce( { isSocket: () => true } );
			jest.spyOn( promises, 'access' ).mockRejectedValue( new Error( 'ENOENT' ) );
			process.env = {};
			return expect( getDockerSocket() ).resolves.toBeNull();
		} );

		it( 'should return socker from DOCKER_HOST if it is valid', () => {
			const expectedPath = '/tmp/docker.sock';
			jest.spyOn( promises, 'stat' ).mockResolvedValueOnce( { isSocket: () => true } );
			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = { DOCKER_HOST: `unix://${ expectedPath }` };
			return expect( getDockerSocket() ).resolves.toBe( expectedPath );
		} );

		it( 'should fall back to default socket if DOCKER_HOST is not accessible', () => {
			const expectedPath = '/var/run/docker.sock';

			jest.spyOn( promises, 'stat' ).mockImplementation( fpath => {
				if ( fpath !== expectedPath ) {
					throw new Error( 'ENOENT' );
				}
				return { isSocket: () => true };
			} );

			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = { DOCKER_HOST: 'unix://mother/mary/this/is/scary' };
			return expect( getDockerSocket() ).resolves.toBe( expectedPath );
		} );
	} );
}

describe( 'getEngineConfig', () => {
	const env = { ...process.env };
	afterEach( () => {
		process.env = env;
	} );

	it.each( [
		[ '/var/run/docker.sock', {}, { socketPath: '/var/run/docker.sock', protocol: 'http' } ],
		[ 'tcp://127.0.0.1:2376', {}, { host: '127.0.0.1', port: '2376', protocol: 'https' } ],
		[
			'/var/run/docker.sock',
			{ DOCKER_CLIENT_TIMEOUT: '100' },
			{ socketPath: '/var/run/docker.sock', protocol: 'http', timeout: 100 },
		],
	] )( 'For %s and %j return %j', ( socket, environment, expected ) => {
		process.env = environment;
		return expect( getEngineConfig( socket ) ).resolves.toEqual(
			expect.objectContaining( expected )
		);
	} );

	it( 'should throw an error for bad host specification', () =>
		expect( getEngineConfig( 'tcp://' ) ).rejects.toThrow() );
} );
