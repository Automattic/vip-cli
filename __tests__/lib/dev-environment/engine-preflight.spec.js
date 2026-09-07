import { describe, expect, it } from '@jest/globals';

import { composeRequirement, podmanPreflight } from '../../../src/lib/dev-environment/engine';

const dockerEngineInfo = {
	engine: 'docker',
	serverVersion: '27.3.1',
	socketPath: '/var/run/docker.sock',
	rootless: false,
};

const podmanEngineInfo = {
	engine: 'podman',
	serverVersion: '6.1.1',
	socketPath: '/run/user/501/podman/podman.sock',
	rootless: true,
};

describe( 'composeRequirement', () => {
	it( 'docker always passes regardless of compose binary presence', () => {
		expect( composeRequirement( dockerEngineInfo ) ).toEqual( { ok: true } );
		expect(
			composeRequirement( { ...dockerEngineInfo, composeBinaryVersion: undefined } )
		).toEqual( { ok: true } );
	} );

	it( 'podman without docker-compose v2 refuses with an actionable remedy', () => {
		const result = composeRequirement( podmanEngineInfo );

		expect( result.ok ).toBe( false );
		expect( result ).toEqual(
			expect.objectContaining( {
				ok: false,
				reason: expect.stringContaining( 'no standalone docker-compose binary' ),
				remedy: expect.stringContaining( 'docs.docker.com/compose/install' ),
			} )
		);
	} );

	it( 'podman with a pre-v2 docker-compose binary refuses with an actionable remedy', () => {
		const result = composeRequirement( { ...podmanEngineInfo, composeBinaryVersion: '1.29.2' } );

		expect( result.ok ).toBe( false );
		expect( result ).toEqual(
			expect.objectContaining( {
				ok: false,
				reason: expect.stringContaining( '1.29.2' ),
			} )
		);
	} );

	it( 'podman with a real docker-compose v2 binary passes', () => {
		expect( composeRequirement( { ...podmanEngineInfo, composeBinaryVersion: '2.29.7' } ) ).toEqual(
			{ ok: true }
		);
	} );
} );

describe( 'podmanPreflight', () => {
	it( 'docker never produces findings, even when probes indicate the sysctl is unset', () => {
		const findings = podmanPreflight( dockerEngineInfo, {
			unprivilegedPortStartAllowsPort80: false,
			isPodmanMacMachine: false,
		} );

		expect( findings ).toEqual( [] );
	} );

	it( 'podman with the sysctl already allowing port 80 produces zero findings', () => {
		const findings = podmanPreflight( podmanEngineInfo, {
			unprivilegedPortStartAllowsPort80: true,
			isPodmanMacMachine: false,
		} );

		expect( findings ).toEqual( [] );
	} );

	it( 'podman on a mac machine with the sysctl unset produces exactly one finding naming the machine ssh remedy', () => {
		const findings = podmanPreflight( podmanEngineInfo, {
			unprivilegedPortStartAllowsPort80: false,
			isPodmanMacMachine: true,
		} );

		expect( findings ).toHaveLength( 1 );
		expect( findings[ 0 ] ).toEqual(
			expect.objectContaining( {
				severity: 'error',
				remedy: expect.stringContaining( 'podman machine ssh' ),
			} )
		);
	} );

	it( 'podman on a linux host with the sysctl unset produces exactly one finding naming the sysctl.d remedy', () => {
		const findings = podmanPreflight( podmanEngineInfo, {
			unprivilegedPortStartAllowsPort80: false,
			isPodmanMacMachine: false,
		} );

		expect( findings ).toHaveLength( 1 );
		expect( findings[ 0 ] ).toEqual(
			expect.objectContaining( {
				severity: 'error',
				remedy: expect.stringContaining( '/etc/sysctl.d' ),
			} )
		);
	} );
} );
