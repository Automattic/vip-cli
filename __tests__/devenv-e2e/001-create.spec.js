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
		expect( await checkEnvExists( expectedSlug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', expectedSlug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ expectedSlug }` );
		expect( result.stderr ).toBe( '' );

		return expect( checkEnvExists( expectedSlug ) ).resolves.toBe( true );
	} );

	it( 'should fail on duplicate slugs', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result1 = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result1.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const result2 = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], {
			env,
		} );
		expect( result2.rc ).toBeGreaterThan( 0 );
		expect( result2.stderr ).toContain( 'Error:  Environment already exists' );
		return expect( checkEnvExists( slug ) ).resolves.toBe( true );
	} );

	it( 'should use sane defaults', async () => {
		const slug = getProjectSlug();
		const expectedMultisite = false;
		const expectedPhpVersion = '8.0';
		const expectedElasticsearch = false;
		const expectedPhpMyAdmin = false;
		const expectedXDebug = false;
		const expectedMailpit = false;
		const expectedPhoton = false;

		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const data = readEnvironmentData( slug );
		expect( data ).toMatchObject( {
			siteSlug: slug,
			wpTitle: expect.any( String ),
			multisite: expectedMultisite,
			mediaRedirectDomain: '',
			elasticsearch: expectedElasticsearch,
			xdebugConfig: '',
			php: expect.stringContaining( `:${ expectedPhpVersion }` ),
			muPlugins: { mode: 'image' },
			appCode: { mode: 'image' },
			wordpress: expect.objectContaining( { mode: 'image', tag: expect.any( String ) } ),
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
		} );
	} );

	it( 'should be configurable via command line', async () => {
		const slug = getProjectSlug();
		const expectedTitle = 'Test';
		const expectedMultisite = true;
		const expectedPhpVersion = '8.0';
		const expectedWordPressVersion = '6.1';
		const expectedElasticsearch = true;
		const expectedPhpMyAdmin = true;
		const expectedXDebug = true;
		const expectedMailpit = true;
		const expectedPhoton = true;

		expect( await checkEnvExists( slug ) ).toBe( false );

		// prettier-ignore
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
			'-e', `${ expectedElasticsearch }`,
			'-p', `${ expectedPhpMyAdmin }`,
			'-x', `${ expectedXDebug }`,
			'-A', `${ expectedMailpit }`,
			'-H', `${ expectedPhoton }`,
		], { env }, true );

		expect( result.rc ).toBe( 0 );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const data = readEnvironmentData( slug );
		expect( data ).toMatchObject( {
			siteSlug: slug,
			wpTitle: expectedTitle,
			multisite: expectedMultisite,
			mediaRedirectDomain: '',
			elasticsearch: expectedElasticsearch,
			xdebugConfig: '',
			php: expect.stringContaining( `:${ expectedPhpVersion }` ),
			muPlugins: expect.objectContaining( { mode: 'image' } ), // BUG: our code adds `{ tag: 'image' }`
			appCode: expect.objectContaining( { mode: 'image' } ), // BUG: our code adds `{ tag: 'image' }`
			wordpress: expect.objectContaining( { mode: 'image', tag: expectedWordPressVersion } ),
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
		} );
	} );
} );
