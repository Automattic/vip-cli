import { describe, expect, it, jest } from '@jest/globals';
import Docker from 'dockerode';
import nock from 'nock';
import { access, mkdtemp, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import xdgBaseDir from 'xdg-basedir';

import { CliTest } from './helpers/cli-test';
import { vipDevEnvCreate, vipDevEnvDestroy } from './helpers/commands';
import { getContainersForProject, killProjectContainers } from './helpers/docker-utils';
import {
	checkEnvExists,
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';
import { getEnvironmentPath } from '../../src/lib/dev-environment/dev-environment-core';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env destroy', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;

	beforeAll( async () => {
		nock.cleanAll();
		nock.enableNetConnect();

		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;

		env = prepareEnvironment( tmpPath );
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );
	afterAll( () => nock.restore() );

	it( 'should fail if environment does not exist', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], {
			env,
		} );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( "Error: Environment doesn't exist." );

		return expect( checkEnvExists( slug ) ).resolves.toBe( false );
	} );

	it( 'should remove existing environment', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		await destroyEnvironment( cliTest, slug, env );
	} );

	it( 'should remove existing environment even without landofile', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const landoFile = path.join( getEnvironmentPath( slug ), '.lando.yml' );
		await expect( access( landoFile ) ).resolves.toBeUndefined();
		await expect( unlink( landoFile ) ).resolves.toBeUndefined();

		await destroyEnvironment( cliTest, slug, env );
	} );

	it( 'should keep the files when asked to', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug, '--soft' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).not.toContain( 'Environment files deleted successfully' );
		expect( result.stdout ).toContain( 'Environment destroyed' );

		// BUG BUG BUG: this means that `vip dev-env destroy --soft` does not destroy the environment
		const landoFile = path.join( getEnvironmentPath( slug ), '.lando.yml' );
		await expect( access( landoFile ) ).resolves.toBeUndefined();
		return expect( checkEnvExists( slug ) ).resolves.toBe( true );
	} );

	describe( 'if the environment is running', () => {
		/** @type {Docker} */
		let docker;
		/** @type {string} */
		let slug;

		beforeAll( () => {
			docker = new Docker();
		} );

		afterEach( () => killProjectContainers( docker, slug ) );

		it( 'should stop and destroy it', async () => {
			slug = getProjectSlug();
			expect( await checkEnvExists( slug ) ).toBe( false );

			await createAndStartEnvironment( cliTest, slug, env );
			await destroyEnvironment( cliTest, slug, env );

			const containersPromise = getContainersForProject( docker, slug );
			return expect( containersPromise ).resolves.toHaveLength( 0 );
		} );
	} );
} );
