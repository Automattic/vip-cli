import { describe, expect, it, jest } from '@jest/globals';
import Docker from 'dockerode';
import nock from 'nock';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import xdgBaseDir from 'xdg-basedir';

import { CliTest } from './helpers/cli-test';
import { vipDevEnvStart } from './helpers/commands';
import { getContainersForProject, killProjectContainers } from './helpers/docker-utils';
import {
	checkEnvExists,
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env start', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;
	/** @type {Docker} */
	let docker;
	/** @type {string} */
	let slug;

	beforeAll( async () => {
		nock.cleanAll();
		nock.enableNetConnect();

		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;

		env = prepareEnvironment( tmpPath );

		docker = new Docker();
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );
	afterAll( () => nock.restore() );

	afterEach( () => killProjectContainers( docker, slug ) );

	it( 'should fail if environment does not exist', async () => {
		slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStart, '--slug', slug, '-w' ],
			{ env }
		);
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( "Error: Environment doesn't exist." );

		return expect( checkEnvExists( slug ) ).resolves.toBe( false );
	} );

	it( 'should start an environment', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const containersAfterStart = await getContainersForProject( docker, slug );
		const expectedServices = [ 'php', 'database', 'memcached', 'nginx' ];

		expectedServices.forEach( service =>
			expect(
				containersAfterStart.find(
					container => container.Labels[ 'com.docker.compose.service' ] === service
				)
			).not.toBeUndefined()
		);

		await destroyEnvironment( cliTest, slug, env );

		const containersAfterDestroyPromise = getContainersForProject( docker, slug );
		return expect( containersAfterDestroyPromise ).resolves.toHaveLength( 0 );
	} );
} );
