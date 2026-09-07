import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { promises, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';

import {
	getDockerBin,
	getDockerSocket,
	getEngineConfig,
	splitca,
} from '../../../src/lib/dev-environment/docker-utils';

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

		it( 'a podman machine socket on mac is found when no docker candidate exists', () => {
			const expectedPath = path.join(
				homedir(),
				'.local',
				'share',
				'containers',
				'podman',
				'machine',
				'podman.sock'
			);

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

		it( 'a podman rootless socket under XDG_RUNTIME_DIR is found when no earlier candidate exists', () => {
			const runtimeDir = '/run/user/1000';
			const expectedPath = path.join( runtimeDir, 'podman', 'podman.sock' );

			jest.spyOn( promises, 'stat' ).mockImplementation( fpath => {
				if ( fpath !== expectedPath ) {
					throw new Error( 'ENOENT' );
				}
				return { isSocket: () => true };
			} );

			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = { XDG_RUNTIME_DIR: runtimeDir };
			return expect( getDockerSocket() ).resolves.toBe( expectedPath );
		} );

		it( 'the podman machine inspect fallback is used only when a podman binary is present', async () => {
			jest.spyOn( promises, 'stat' ).mockRejectedValue( new Error( 'ENOENT' ) );
			process.env = {};

			const exec = jest.fn().mockRejectedValue( new Error( 'ENOENT' ) );

			await expect( getDockerSocket( exec ) ).resolves.toBeNull();
			expect( exec ).toHaveBeenCalledWith( 'podman', [ '--version' ] );
			expect( exec ).not.toHaveBeenCalledWith( 'podman', [ 'machine', 'inspect' ] );
		} );

		it( 'a socket resolved via podman machine inspect is returned when no static candidate exists', () => {
			const expectedPath =
				'/Users/tester/.local/share/containers/podman/machine/podman-machine-default/podman.sock';

			jest.spyOn( promises, 'stat' ).mockImplementation( fpath => {
				if ( fpath !== expectedPath ) {
					throw new Error( 'ENOENT' );
				}
				return { isSocket: () => true };
			} );
			jest.spyOn( promises, 'access' ).mockResolvedValueOnce( undefined );

			process.env = {};

			const exec = jest.fn().mockImplementation( ( bin, args ) => {
				if ( args[ 0 ] === '--version' ) {
					return Promise.resolve( { stdout: 'podman version 5.0.0' } );
				}

				return Promise.resolve( {
					stdout: JSON.stringify( [
						{
							ConnectionInfo: {
								PodmanSocket: { Path: expectedPath },
							},
						},
					] ),
				} );
			} );

			return expect( getDockerSocket( exec ) ).resolves.toBe( expectedPath );
		} );
	} );
}

describe( 'getDockerBin', () => {
	it( "a machine with a docker binary keeps today's resolution unchanged", async () => {
		const exec = jest.fn().mockResolvedValue( { stdout: 'Docker version 27.0.0' } );

		await expect( getDockerBin( exec ) ).resolves.toBeNull();
		expect( exec ).toHaveBeenCalledWith( 'docker', [ '--version' ] );
		expect( exec ).not.toHaveBeenCalledWith( 'podman', [ '--version' ] );
	} );

	it( 'vip-cli resolves the podman binary as its docker CLI when no docker binary exists', async () => {
		const exec = jest.fn().mockImplementation( bin => {
			if ( bin === 'docker' ) {
				return Promise.reject( new Error( 'ENOENT' ) );
			}

			return Promise.resolve( { stdout: 'podman version 5.0.0' } );
		} );

		await expect( getDockerBin( exec ) ).resolves.toBe( 'podman' );
		expect( exec ).toHaveBeenCalledWith( 'docker', [ '--version' ] );
		expect( exec ).toHaveBeenCalledWith( 'podman', [ '--version' ] );
	} );

	it( 'a machine with neither docker nor podman resolves to null, preserving the could-not-be-located error path', async () => {
		const exec = jest.fn().mockRejectedValue( new Error( 'ENOENT' ) );

		await expect( getDockerBin( exec ) ).resolves.toBeNull();
	} );
} );

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
