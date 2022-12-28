/**
 * External dependencies
 */
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import { readEnvironmentData } from '../../src/lib/dev-environment/dev-environment-core';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvUpdate } from './helpers/commands';

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
		expect( checkEnvExists( slug ) ).toBe( false );
		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvUpdate, '--slug', slug ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );
		expect( checkEnvExists( slug ) ).toBe( false );
	} );

	it( 'should not update the environment if there are no changes', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvUpdate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );

		const dataAfter = readEnvironmentData( slug );

		expect( dataBefore ).toEqual( dataAfter );
	} );

	it( 'should update the environment', async () => {
		const slug = getProjectSlug();
		const expectedElasticSearch = false;
		const expectedPhpMyAdmin = false;
		const expectedXDebug = false;
		const expectedMailHog = false;

		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );
		expect( dataBefore ).toMatchObject( {
			siteSlug: slug,
			elasticsearch: expectedElasticSearch,
			mailhog: expectedMailHog,
		} );

		// Our bugs :-)
		expect( dataBefore ).not.toHaveProperty( 'phpmyadmin' );
		expect( dataBefore ).not.toHaveProperty( 'xdebug' );

		result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvUpdate,
			'--slug', slug,
			'-e', `${ ! expectedElasticSearch }`,
			'-p', `${ ! expectedPhpMyAdmin }`,
			'-x', `${ ! expectedXDebug }`,
			'--mailhog', `${ ! expectedMailHog }`,
		], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const dataAfter = readEnvironmentData( slug );
		expect( dataAfter ).toMatchObject( {
			siteSlug: slug,
			elasticsearch: ! expectedElasticSearch,
			phpmyadmin: ! expectedPhpMyAdmin,
			xdebug: ! expectedXDebug,
			mailhog: ! expectedMailHog,
		} );
	} );

	it( 'should not update multisiteness', async () => {
		const slug = getProjectSlug();
		const expectedMultiSite = true;

		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvCreate,
			'--slug', slug,
			'--multisite', `${ expectedMultiSite }`,
		], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const dataBefore = readEnvironmentData( slug );
		expect( dataBefore ).toMatchObject( {
			siteSlug: slug,
			multisite: expectedMultiSite,
		} );

		result = await cliTest.spawn( [
			process.argv[ 0 ], vipDevEnvUpdate,
			'--slug', slug,
			'--multisite', `${ ! expectedMultiSite }`,
		], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const dataAfter = readEnvironmentData( slug );
		expect( dataAfter ).toMatchObject( {
			siteSlug: slug,
			multisite: expectedMultiSite,
		} );
	} );
} );
