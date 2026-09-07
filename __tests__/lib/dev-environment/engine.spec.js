import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
	detectEngine,
	proxyPublishAddress,
	proxySocketMount,
} from '../../../src/lib/dev-environment/engine';

const fixturesDir = path.join( __dirname, '..', '..', '..', '__fixtures__', 'dev-environment' );
const podmanInfoJson = readFileSync( path.join( fixturesDir, 'podman-info.json' ), 'utf8' );
const dockerInfoJson = readFileSync( path.join( fixturesDir, 'docker-info.json' ), 'utf8' );

const execReturning = stdout => async () => ( { stdout } );

describe( 'detectEngine', () => {
	it( 'detects podman as the dev-env engine from its own info output', async () => {
		const engineInfo = await detectEngine(
			'docker',
			'/run/user/501/podman/podman.sock',
			execReturning( podmanInfoJson )
		);

		expect( engineInfo.engine ).toBe( 'podman' );
		expect( engineInfo.serverVersion ).toBe( '6.1.1' );
		expect( engineInfo.socketPath ).toBe( '/run/user/501/podman/podman.sock' );
		expect( engineInfo.rootless ).toBe( true );
	} );

	it( 'detects docker as the dev-env engine from its own info output', async () => {
		const engineInfo = await detectEngine(
			'docker',
			'/var/run/docker.sock',
			execReturning( dockerInfoJson )
		);

		expect( engineInfo.engine ).toBe( 'docker' );
		expect( engineInfo.serverVersion ).toBe( '27.3.1' );
		expect( engineInfo.composePlugin ).toBe( 'v2.29.7' );
		expect( engineInfo.rootless ).toBe( false );
	} );

	it( "falls back to today's docker/unknown classification for unrecognized info output", async () => {
		const engineInfo = await detectEngine(
			'docker',
			'/var/run/docker.sock',
			execReturning( JSON.stringify( { someUnexpectedShape: true } ) )
		);

		expect( engineInfo ).toEqual( {
			engine: 'docker',
			serverVersion: 'unknown',
			socketPath: '/var/run/docker.sock',
			rootless: false,
		} );
	} );

	it( 'never throws when the info command itself fails', async () => {
		const engineInfo = await detectEngine( 'docker', '/var/run/docker.sock', async () => {
			throw new Error( 'docker: command not found' );
		} );

		expect( engineInfo ).toEqual( {
			engine: 'docker',
			serverVersion: 'unknown',
			socketPath: '/var/run/docker.sock',
			rootless: false,
		} );
	} );

	it( 'never throws when the info command returns unparseable output', async () => {
		const engineInfo = await detectEngine(
			'docker',
			'/var/run/docker.sock',
			execReturning( 'not json' )
		);

		expect( engineInfo ).toEqual( {
			engine: 'docker',
			serverVersion: 'unknown',
			socketPath: '/var/run/docker.sock',
			rootless: false,
		} );
	} );
} );

describe( 'proxyPublishAddress', () => {
	it( 'publishes the proxy on 0.0.0.0 under podman', () => {
		expect(
			proxyPublishAddress( {
				engine: 'podman',
				serverVersion: '6.1.1',
				socketPath: '/run/user/501/podman/podman.sock',
				rootless: true,
			} )
		).toBe( '0.0.0.0' );
	} );

	it( 'keeps publishing the proxy on 127.0.0.1 under docker', () => {
		expect(
			proxyPublishAddress( {
				engine: 'docker',
				serverVersion: '27.3.1',
				socketPath: '/var/run/docker.sock',
				rootless: false,
			} )
		).toBe( '127.0.0.1' );
	} );
} );

describe( 'proxySocketMount', () => {
	it( 'mounts the real podman socket for the proxy under podman', () => {
		const mount = proxySocketMount( {
			engine: 'podman',
			serverVersion: '6.1.1',
			socketPath: '/run/user/501/podman/podman.sock',
			rootless: true,
		} );

		expect( mount.source ).toBe( '/run/user/501/podman/podman.sock' );
		expect( mount.target ).toBe( '/var/run/docker.sock' );
	} );

	it( 'never marks the socket mount selinux-disabled off a non-selinux host, even under podman', () => {
		const mount = proxySocketMount( {
			engine: 'podman',
			serverVersion: '6.1.1',
			socketPath: '/run/user/501/podman/podman.sock',
			rootless: true,
		} );

		expect( mount.selinuxLabelDisable ).toBe( false );
	} );

	it( 'keeps mounting the existing docker socket unchanged under docker', () => {
		const mount = proxySocketMount( {
			engine: 'docker',
			serverVersion: '27.3.1',
			socketPath: '/var/run/docker.sock',
			rootless: false,
		} );

		expect( mount ).toEqual( {
			source: '/var/run/docker.sock',
			target: '/var/run/docker.sock',
			selinuxLabelDisable: false,
		} );
	} );

	it( 'falls back to the default docker socket path when none was discovered', () => {
		const mount = proxySocketMount( {
			engine: 'docker',
			serverVersion: 'unknown',
			socketPath: '',
			rootless: false,
		} );

		expect( mount.source ).toBe( '/var/run/docker.sock' );
	} );
} );
