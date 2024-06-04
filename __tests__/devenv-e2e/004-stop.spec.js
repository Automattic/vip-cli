import { afterAll, describe, expect, it, jest } from '@jest/globals';
import Docker from 'dockerode';
import nock from 'nock';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import xdgBaseDir from 'xdg-basedir';

import { CliTest } from './helpers/cli-test';
import { vipDevEnvStop } from './helpers/commands';
import { getContainersForProject, killProjectContainers } from './helpers/docker-utils';
import {
	checkEnvExists,
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env stop', () => {
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

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], {
			env,
		} );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment not found.' );

		return expect( checkEnvExists( slug ) ).resolves.toBe( false );
	} );

	it( 'should stop a running environment', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `environment "${ slug }" stopped` );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		await destroyEnvironment( cliTest, slug, env );
	} );

	it( 'should not fail if the environment is stopped', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `environment "${ slug }" stopped` );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		await destroyEnvironment( cliTest, slug, env );
	} );

	it( 'should be able to stop all environments', async () => {
		const slug1 = getProjectSlug();
		const slug2 = getProjectSlug();
		expect( await checkEnvExists( slug1 ) ).toBe( false );
		expect( await checkEnvExists( slug2 ) ).toBe( false );

		await createAndStartEnvironment( cliTest, slug1, env );
		await createAndStartEnvironment( cliTest, slug2, env );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStop, '--all' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `environment "${ slug1 }" stopped` );
		expect( result.stdout ).toContain( `environment "${ slug2 }" stopped` );

		await destroyEnvironment( cliTest, slug1, env );
		await destroyEnvironment( cliTest, slug2, env );
	} );
} );
