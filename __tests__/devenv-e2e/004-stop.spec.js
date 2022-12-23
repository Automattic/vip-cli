/**
 * External dependencies
 */
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';
import Docker from 'dockerode';
import nock from 'nock';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import { checkEnvExists, createAndStartEnvironment, destroyEnvironment, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvStop } from './helpers/commands';
import { getContainersForProject, killProjectContainers } from './helpers/docker-utils';

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
		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should stop a running environment', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'environment stopped' );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		await destroyEnvironment( cliTest, slug, env, true );
	} );

	it( 'should not fail if the environment is stopped', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStop, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'environment stopped' );

		const containersAfterStop = await getContainersForProject( docker, slug );
		expect( containersAfterStop ).toHaveLength( 0 );

		await destroyEnvironment( cliTest, slug, env, true );
	} );
} );
