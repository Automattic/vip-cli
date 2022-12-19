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
import { vipDevEnvCreate } from './helpers/commands';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env create', () => {
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

	it( 'should create a new environment', async () => {
		const expectedSlug = getProjectSlug();
		expect( checkEnvExists( expectedSlug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', expectedSlug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ expectedSlug }` );
		expect( result.stderr ).toBe( '' );

		expect( checkEnvExists( expectedSlug ) ).toBe( true );
	} );

	it( 'should fail on duplicate slugs', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		const result1 = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result1.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const result2 = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env } );
		expect( result2.rc ).toBeGreaterThan( 0 );
		expect( result2.stderr ).toContain( 'Error:  Environment already exists' );
		expect( checkEnvExists( slug ) ).toBe( true );
	} );

	it( 'should use sane defaults', async () => {
		const slug = getProjectSlug();
		const expectedMultisite = false;
		const expectedPhpVersion = '8.0';
		const expectedElasticSearch = false;

		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const data = readEnvironmentData( slug );
		expect( data ).toEqual(
			expect.objectContaining( {
				siteSlug: slug,
				wpTitle: expect.any( String ),
				multisite: expectedMultisite,
				mariadb: '10.3',
				mediaRedirectDomain: '',
				elasticsearch: expectedElasticSearch,
				statsd: false,
				xdebugConfig: '',
				php: expect.stringContaining( `:${ expectedPhpVersion }` ),
				muPlugins: { mode: 'image' },
				appCode: { mode: 'image' },
				wordpress: expect.objectContaining( { mode: 'image', tag: expect.any( String ) } ),
			} )
		);

		// Our bugs :-)
		expect( data ).not.toHaveProperty( 'phpmyadmin' );
		expect( data ).not.toHaveProperty( 'xdebug' );
		expect( data ).not.toHaveProperty( 'mailhog' );
	} );

	it( 'should be configurable via command line', async () => {
		const slug = getProjectSlug();
		const expectedTitle = 'Test';
		const expectedMultisite = true;
		const expectedPhpVersion = '8.0';
		const expectedWordPressVersion = '6.1';
		const expectedElasticSearch = true;
		const expectedPhpMyAdmin = true;
		const expectedXDebug = true;
		const expectedMailHog = true;

		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [
			process.argv[ 0 ],
			vipDevEnvCreate,
			'--slug', slug,
			'--app-code', 'image',
			'--title', expectedTitle,
			'--multisite', `${ expectedMultisite }`,
			'--php', expectedPhpVersion,
			'--wordpress', expectedWordPressVersion,
			'--mu-plugins', 'image',
			'-e', `${ expectedElasticSearch }`,
			'-p', `${ expectedPhpMyAdmin }`,
			'-x', `${ expectedXDebug }`,
			'--mailhog', `${ expectedMailHog }`,
		], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		const data = readEnvironmentData( slug );
		expect( data ).toEqual(
			expect.objectContaining( {
				siteSlug: slug,
				wpTitle: expectedTitle,
				multisite: expectedMultisite,
				mariadb: '10.3',
				mediaRedirectDomain: '',
				elasticsearch: expectedElasticSearch,
				statsd: false,
				xdebugConfig: '',
				php: expect.stringContaining( `:${ expectedPhpVersion }` ),
				muPlugins: expect.objectContaining( { mode: 'image' } ), // BUG: our code adds `{ tag: 'image' }`
				appCode: expect.objectContaining( { mode: 'image' } ), // BUG: our code adds `{ tag: 'image' }`
				wordpress: expect.objectContaining( { mode: 'image', tag: expectedWordPressVersion } ),
				phpmyadmin: expectedPhpMyAdmin,
				xdebug: expectedXDebug,
				mailhog: expectedMailHog,
			} )
		);
	} );
} );
