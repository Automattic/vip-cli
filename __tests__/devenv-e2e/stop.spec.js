/**
 * External dependencies
 */
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';
import Docker from 'dockerode';
import nock from 'nock';

/**
 * Internal dependencies
 */
import { CliTest } from './cli-test';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './utils';
import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart, vipDevEnvStop } from './commands';
import { getContainersForProject, getExistingContainers, killContainersExcept } from './docker-utils';

jest.setTimeout( 600 * 1000 );

// Nock is weird :-) If the request goes to a UNIX socket, it parses it in a strange way and sets the host and port to localhost:80
nock.enableNetConnect( host => host === 'localhost:80' );

describe( 'vip dev-env stop', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;
	/** @type {Docker} */
	let docker;
	/** @type {string[]} */
	let containerIDs;

	beforeAll( async () => {
		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;

		env = prepareEnvironment( tmpPath );

		docker = new Docker();
		containerIDs = await getExistingContainers( docker );
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );

	afterEach( () => killContainersExcept( docker, containerIDs ) );

	it( 'should fail if environment does not exist', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should stop a running environment', async () => {
		const slug = getProjectSlug();
		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'environment stopped' );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Environment destroyed.' );
		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should not fail if the environment is stopped', async () => {
		const slug = getProjectSlug();
		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'environment stopped' );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Environment destroyed.' );
		expect( checkEnvExists( slug ) ).toBe( false );
	} );
} );
