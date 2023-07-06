/**
 * External dependencies
 */
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';
import Docker from 'dockerode';
import nock from 'nock';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import {
	checkEnvExists,
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';
import { vipDevEnvLogs } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';

describe( 'vip dev-env logs', () => {
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
			expect( await checkEnvExists( slug ) ).toBe( false );

			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvLogs, '--slug', slug ], {
				env,
			} );
			expect( result.rc ).toBeGreaterThan( 0 );
			expect( result.stderr ).toContain( "Error: Environment doesn't exist." );

			return expect( checkEnvExists( slug ) ).resolves.toBe( false );
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

		it( 'should display all the logs', async () => {
			const result = await cliTest.spawn(
				[ process.argv[ 0 ], vipDevEnvLogs, '--slug', slug ],
				{ env },
				true
			);
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toMatch( /database_1/ );
			expect( result.stdout ).toMatch( /STARTING UP/ );
		} );

		it( 'should fail on unknown services', async () => {
			const result = await cliTest.spawn(
				[ process.argv[ 0 ], vipDevEnvLogs, '--slug', slug, '--service', 'foobar' ],
				{ env }
			);
			expect( result.rc ).toBeGreaterThan( 0 );
			console.log( result.stderr );
			expect( result.stderr ).toContain(
				"Error:  Service 'foobar' not found. Please choose from one: devtools, nginx, php, database, memcached, wordpress, vip-mu-plugins, demo-app-code"
			);
		} );

		it( 'should display logs for a selected service', async () => {
			const result = await cliTest.spawn(
				[ process.argv[ 0 ], vipDevEnvLogs, '--slug', slug, '--service', 'php' ],
				{ env },
				true
			);
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toMatch( /php_1/ );
		} );
	} );
} );
