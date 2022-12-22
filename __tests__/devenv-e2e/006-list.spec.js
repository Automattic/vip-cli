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
import { checkEnvExists, createAndStartEnvironment, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvList } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env list', () => {
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

	it( 'should handle no environments', async () => {
		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Found 0 environments.' );
	} );

	it( 'should list multiple environments', async () => {
		const slug1 = getProjectSlug();
		const slug2 = getProjectSlug();
		expect( checkEnvExists( slug1 ) ).toBe( false );
		expect( checkEnvExists( slug2 ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug1 ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug1 }` );
		expect( checkEnvExists( slug1 ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug2 ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug2 }` );
		expect( checkEnvExists( slug2 ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Found 2 environments' );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug1 }` ) );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug2 }` ) );
		expect( result.stdout ).toMatch( /STATUS\s+DOWN/ );
		expect( result.stdout ).not.toMatch( /STATUS\s+UP/ );
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

			const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( 'Found 1 environment' );
			expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
			expect( result.stdout ).toMatch( /STATUS\s+UP/ );
		}, 120000 );
	} );
} );
