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
import { createAndStartEnvironment, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvInfo } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';

jest.setTimeout( 30 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

describe( 'vip dev-env info', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;

	beforeAll( () => {
		nock.cleanAll();
		nock.enableNetConnect();

		cliTest = new CliTest();
	} );

	afterAll( () => nock.restore() );

	beforeEach( async () => {
		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;

		env = prepareEnvironment( tmpPath );
	} );

	afterEach( () => rm( tmpPath, { recursive: true, force: true } ) );

	it( 'should fail on a non-existing environment', async () => {
		const slug = getProjectSlug();
		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvInfo, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );
	} );

	it( 'should display the info', async () => {
		const slug = getProjectSlug();

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( result.stderr ).toBe( '' );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvInfo, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
		expect( result.stdout ).toMatch( /STATUS\s+DOWN/ );
		[ 'LOCATION', 'SERVICES', 'NGINX URLS', 'LOGIN URL', 'DEFAULT USERNAME', 'DEFAULT PASSWORD' ]
			.forEach( str => expect( result.stdout ).toContain( str ) );
	} );

	describe( 'for started environments', () => {
		/** @type {Docker} */
		let docker;
		/** @type {string} */
		let slug;

		beforeAll( () => {
			docker = new Docker();
		} );

		afterEach( () => killProjectContainers( docker, slug ) );

		it( 'should list them as UP', async () => {
			slug = getProjectSlug();

			await createAndStartEnvironment( cliTest, slug, env );

			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvInfo ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
			expect( result.stdout ).toMatch( /STATUS\s+UP/ );
		}, 120000 );
	} );
} );
