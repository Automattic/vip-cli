/**
 * External dependencies
 */
import { access, mkdtemp, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';
import Docker from 'dockerode';
import nock from 'nock';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import { getEnvironmentPath } from '../../src/lib/dev-environment/dev-environment-core';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart } from './helpers/commands';
import { getContainersForProject, getExistingContainers, killContainersExcept } from './helpers/docker-utils';

jest.setTimeout( 600 * 1000 );

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
		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should remove existing environment', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Environment files deleted successfully' );
		expect( result.stdout ).toContain( 'Environment destroyed' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should remove existing environment even without landofile', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const landoFile = path.join( getEnvironmentPath( slug ), '.lando.yml' );
		await expect( access( landoFile ) ).resolves.toBeUndefined();
		await expect( unlink( landoFile ) ).resolves.toBeUndefined();

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Environment files deleted successfully' );
		expect( result.stdout ).toContain( 'Environment destroyed' );

		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should keep the files when asked to', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug, '--soft' ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).not.toContain( 'Environment files deleted successfully' );
		expect( result.stdout ).toContain( 'Environment destroyed' );

		// BUG BUG BUG: this means that `vip dev-env destroy --soft` does not destroy the environment
		const landoFile = path.join( getEnvironmentPath( slug ), '.lando.yml' );
		await expect( access( landoFile ) ).resolves.toBeUndefined();
		expect( checkEnvExists( slug ) ).toBe( true );
	} );

	describe( 'if the environment is running', () => {
		/** @type {Docker} */
		let docker;
		/** @type {string[]} */
		let containerIDs;

		beforeAll( async () => {
			docker = new Docker();
			containerIDs = await getExistingContainers( docker );
		} );

		afterEach( () => killContainersExcept( docker, containerIDs ) );

		it( 'should stop and destroy it', async () => {
			const slug = getProjectSlug();
			expect( checkEnvExists( slug ) ).toBe( false );

			let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( checkEnvExists( slug ) ).toBe( true );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toMatch( /STATUS\s+UP/u );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( 'Environment files deleted successfully' );
			expect( result.stdout ).toContain( 'Environment destroyed' );

			expect( checkEnvExists( slug ) ).toBe( false );

			const containers = await getContainersForProject( docker, slug );
			expect( containers ).toHaveLength( 0 );
		} );
	} );
} );
