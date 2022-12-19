/**
 * External dependencies
 */
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';
import Docker from 'dockerode';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import { DEFAULT_SLUG } from '../../src/lib/dev-environment/dev-environment-cli';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvList, vipDevEnvStart } from './helpers/commands';
import nock from 'nock';
import { getExistingContainers, killContainersExcept } from './helpers/docker-utils';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env list', () => {
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

	it( `should list the anonymous environment as "${ DEFAULT_SLUG }"`, async () => {
		const slug = DEFAULT_SLUG;
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( result.stderr ).toBe( '' );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Found 1 environment' );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ DEFAULT_SLUG }` ) );
		expect( result.stdout ).toMatch( /STATUS\s+DOWN/ );
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
		/** @type {string[]} */
		let containerIDs;

		beforeAll( async () => {
			docker = new Docker();
			containerIDs = await getExistingContainers( docker );
		} );

		afterEach( () => killContainersExcept( docker, containerIDs ) );

		it( 'should list them as UP', async () => {
			const slug = getProjectSlug();

			let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toMatch( /STATUS\s+UP/u );

			result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
			expect( result.rc ).toBe( 0 );
			expect( result.stdout ).toContain( 'Found 1 environment' );
			expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
			expect( result.stdout ).toMatch( /STATUS\s+UP/ );
		} );
	} );
} );
