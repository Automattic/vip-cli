import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { detectEngine } from '../../../src/lib/dev-environment/engine';

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
