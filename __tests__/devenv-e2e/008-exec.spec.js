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
import { CliTest } from './helpers/cli-test';
import { checkEnvExists, createAndStartEnvironment, destroyEnvironment, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvExec } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env exec', () => {
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

			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug ], { env } );
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
				await destroyEnvironment( cliTest, slug, env );
			} finally {
				await killProjectContainers( docker, slug );
			}
		} );

		it( 'should run known commands', async () => {
			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--', 'wp', 'option', 'get', 'home' ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( `http://${ slug }.vipdev.lndo.site` );
		} );

		it( 'should fail on unknown commands', async () => {
			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--', 'ls' ], { env } );
			expect( result.rc ).toBeGreaterThan( 0 );
			expect( result.stderr ).toContain( 'Error: ls is not a known lando task' );
		} );

		it( 'should not produce superfluous output in silent mode', async () => {
			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvExec, '--slug', slug, '--quiet', '--', 'wp', 'option', 'get', 'home' ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout.trim() ).toBe( `http://${ slug }.vipdev.lndo.site` );
		} );

		it.todo( 'vip dev-env exec --force' );
	} );
} );
