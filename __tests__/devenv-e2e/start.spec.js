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
import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart } from './commands';
import { getContainersForProject, getExistingContainers, killContainersExcept } from './docker-utils';

jest.setTimeout( 600 * 1000 );

describe( 'vip dev-env start', () => {
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
		// Nock is weird :-) If the request goes to a UNIX socket, it parses it in a strange way and sets the host and port to localhost:80
		nock.enableNetConnect( host => host === 'localhost:80' );

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

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should start an environment', async () => {
		const slug = getProjectSlug();
		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		const containersAfterStart = await getContainersForProject( docker, slug );
		const expectedServices = [
			'php',
			'vip-mu-plugins',
			'wordpress',
			'database',
			'memcached',
			'demo-app-code',
			'nginx',
			'devtools',
		];

		expectedServices.forEach( service =>
			expect( containersAfterStart.find( container => container.Labels[ 'com.docker.compose.service' ] === service ) ).not.toBeUndefined()
		);

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env } );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Environment destroyed.' );
		expect( checkEnvExists( slug ) ).toBe( false );

		const containersAfterDestroy = await getContainersForProject( docker, slug );
		expect( containersAfterDestroy ).toHaveLength( 0 );
	} );
} );
