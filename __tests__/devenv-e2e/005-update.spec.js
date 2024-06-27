import { describe, expect, it, jest } from '@jest/globals';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import xdgBaseDir from 'xdg-basedir';

import { CliTest } from './helpers/cli-test';
import { vipDevEnvCreate, vipDevEnvUpdate } from './helpers/commands';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { readEnvironmentData } from '../../src/lib/dev-environment/dev-environment-core';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env update', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;

	beforeAll( async () => {
		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;

		env = prepareEnvironment( tmpPath );
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );

	it( 'should fail if the environment does not exist', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );
		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvUpdate, '--slug', slug ], {
			env,
		} );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( "Error: Environment doesn't exist." );
		expect( await checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should not update the environment if there are no changes', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );

		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvUpdate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );

		const dataAfter = readEnvironmentData( slug );

		delete dataBefore.autologinKey;
		delete dataAfter.autologinKey;
		expect( dataBefore ).toEqual( dataAfter );
	} );

	it( 'should update the environment', async () => {
		const slug = getProjectSlug();
		const expectedElasticsearch = false;
		const expectedPhpMyAdmin = false;
		const expectedXDebug = false;
		const expectedMailpit = false;
		const expectedPhoton = false;
		const expectedCron = false;

		expect( await checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );
		expect( dataBefore ).toMatchObject( {
			siteSlug: slug,
			elasticsearch: expectedElasticsearch,
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
			cron: expectedCron,
		} );

		// prettier-ignore
		result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvUpdate,
			'--slug', slug,
			'-e', `${ ! expectedElasticsearch }`,
			'-p', `${ ! expectedPhpMyAdmin }`,
			'-x', `${ ! expectedXDebug }`,
			'-A', `${ ! expectedMailpit }`,
			'-H', `${ ! expectedPhoton }`,
			'-c', `${ ! expectedCron }`,
		], { env }, true );

		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const dataAfter = readEnvironmentData( slug );
		expect( dataAfter ).toMatchObject( {
			siteSlug: slug,
			elasticsearch: ! expectedElasticsearch,
			phpmyadmin: ! expectedPhpMyAdmin,
			xdebug: ! expectedXDebug,
			mailpit: ! expectedMailpit,
			photon: ! expectedPhoton,
			cron: ! expectedCron,
		} );
	} );

	it( 'should not update multisiteness', async () => {
		const slug = getProjectSlug();
		const expectedMultiSite = true;

		expect( await checkEnvExists( slug ) ).toBe( false );

		// prettier-ignore
		let result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvCreate,
			'--slug', slug,
			'--multisite', `${ expectedMultiSite }`,
		], { env }, true );

		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );
		expect( dataBefore ).toMatchObject( {
			siteSlug: slug,
			multisite: expectedMultiSite,
		} );

		// prettier-ignore
		result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvUpdate,
			'--slug', slug,
			'--multisite', `${ ! expectedMultiSite }`,
		], { env }, true );

		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const dataAfter = readEnvironmentData( slug );
		expect( dataAfter ).toMatchObject( {
			siteSlug: slug,
			multisite: expectedMultiSite,
		} );
	} );

	it( 'does not replace mariadb with mysql', async () => {
		const slug = getProjectSlug();
		const basePath = path.join( tmpPath, 'vip', 'dev-environment', slug );
		await mkdir( basePath );

		const src = [
			path.join( __dirname, '../../__fixtures__/dev-env-e2e/instance_data_mariadb.json' ),
			path.join( __dirname, '../../__fixtures__/dev-env-e2e/.lando_mariadb.yml' ),
		];

		const dst = [
			path.join( basePath, 'instance_data.json' ),
			path.join( basePath, '.lando.yml' ),
		];

		await Promise.all( [ copyFile( src[ 0 ], dst[ 0 ] ), copyFile( src[ 1 ], dst[ 1 ] ) ] );

		expect( await checkEnvExists( slug ) ).toBe( true );

		// prettier-ignore
		const result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvUpdate,
			'--slug', slug,
			'--mailpit', 'true',
		], { env }, true );

		expect( result.rc ).toBe( 0 );

		const dataAfter = readEnvironmentData( slug );
		expect( dataAfter ).toMatchObject( {
			mariadb: expect.any( String ),
			mailpit: true,
		} );

		const landofile = await readFile( dst[ 1 ], 'utf8' );
		expect( landofile ).not.toContain( 'image: mysql:' );
		expect( landofile ).toContain( 'image: mariadb:' );
		expect( landofile ).toContain( 'mailpit:' );
	} );
} );
