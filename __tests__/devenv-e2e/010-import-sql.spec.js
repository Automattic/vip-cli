/**
 * External dependencies
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
import { checkEnvExists, createAndStartEnvironment, destroyEnvironment, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvExec, vipDevEnvImportSQL } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env import sql', () => {
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

	describe( 'if the environment does not exist', () => {
		it( 'should fail', async () => {
			const slug = getProjectSlug();
			expect( checkEnvExists( slug ) ).toBe( false );

			const file = path.join( __dirname, '../../__fixtures__/dev-env-e2e/empty.sql' );
			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvImportSQL, '--slug', slug, file, '--skip-validate' ], { env } );
			expect( result.rc ).toBeGreaterThan( 0 );
			expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );

			expect( checkEnvExists( slug ) ).toBe( false );
		} );
	} );

	describe( 'if the environment exists', () => {
		/** @type {Docker} */
		let docker;
		/** @type {string} */
		let slug;

		beforeAll( async () => {
			docker = new Docker();

			slug = getProjectSlug();
			await createAndStartEnvironment( cliTest, slug, env );
		} );

		afterAll( async () => {
			try {
				await destroyEnvironment( cliTest, slug, env, true );
			} finally {
				await killProjectContainers( docker, slug );
			}
		} );

		it( 'should fail if the file fails validation', async () => {
			const file = path.join( __dirname, '../../__fixtures__/dev-env-e2e/fail-validation.sql' );
			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvImportSQL, '--slug', slug, file ], { env } );
			expect( result.rc ).toBeGreaterThan( 0 );
			expect( result.stderr ).toContain( 'SQL Error: DROP TABLE was not found' );
			expect( result.stderr ).toContain( 'SQL Error: CREATE TABLE was not found' );
		} );

		it( 'should allow to bypass validation', async () => {
			const file = path.join( __dirname, '../../__fixtures__/dev-env-e2e/fail-validation.sql' );
			let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvImportSQL, '--slug', slug, file, '--skip-validate' ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( 'Success: Database imported' );
			expect( result.stdout ).toContain( 'Success: The cache was flushed' );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--quiet', '--', 'wp', 'option', 'get', 'e2etest' ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout.trim() ).toBe( '200' );
		} );

		it( 'should correctly perform replace', async () => {
			let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--quiet', '--', 'wp', 'db', 'export', '-' ], { env }, true );
			expect( result.rc ).toBe( 0 );

			const dumpFileName = path.join( tmpPath, 'dump.sql' );
			await writeFile( dumpFileName, result.stdout );

			const expectedHomeValue = 'http://test.vipdev.lndo.site';

			result = await cliTest.spawn( [
				process.argv[ 0 ], vipDevEnvImportSQL,
				'--slug', slug,
				dumpFileName,
				'-r', `http://${ slug }.vipdev.lndo.site,${ expectedHomeValue }`,
			], { env }, true );

			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( 'Success: Database imported' );
			expect( result.stdout ).toContain( 'Success: The cache was flushed' );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--quiet', '--', 'wp', 'option', 'get', 'home' ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout.trim() ).toBe( expectedHomeValue );
		} );
	} );
} );
