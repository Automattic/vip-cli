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
import {
	checkEnvExists,
	getProjectSlug,
	prepareEnvironment,
	writeConfigurationFile,
} from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvUpdate } from './helpers/commands';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env configuration file', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;
	/** @type {string} */
	let tmpWorkingDirectoryPath;

	beforeAll( async () => {
		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		xdgBaseDir.data = tmpPath;
		env = prepareEnvironment( tmpPath );

		tmpWorkingDirectoryPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-working-' ) );
	} );

	afterAll( () => {
		rm( tmpPath, { recursive: true, force: true } );
		rm( tmpWorkingDirectoryPath, { recursive: true, force: true } );
	} );

	it( 'should fail if configuration-version is missing', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			slug,
		} );

		const spawnOptions = {
			env,
			cwd: tmpWorkingDirectoryPath,
		};
		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate ],
			spawnOptions,
			false
		);
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain(
			"Configuration file .vip-dev-env.yml is available but couldn't be loaded"
		);
		return expect( checkEnvExists( slug ) ).resolves.toBe( false );
	} );

	it( 'should fail if slug is missing', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			'configuration-version': '0.preview-unstable',
		} );

		const spawnOptions = {
			env,
			cwd: tmpWorkingDirectoryPath,
		};
		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate ],
			spawnOptions,
			false
		);
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain(
			"Configuration file .vip-dev-env.yml is available but couldn't be loaded"
		);
		return expect( checkEnvExists( slug ) ).resolves.toBe( false );
	} );

	it( 'should create a new environment with version and slug', async () => {
		const expectedSlug = getProjectSlug();
		expect( await checkEnvExists( expectedSlug ) ).toBe( false );

		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			'configuration-version': '0.preview-unstable',
			slug: expectedSlug,
		} );

		const spawnOptions = {
			env,
			cwd: tmpWorkingDirectoryPath,
		};

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate ],
			spawnOptions,
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `Using environment ${ expectedSlug }` );
		expect( result.stderr ).toBe( '' );

		return expect( checkEnvExists( expectedSlug ) ).resolves.toBe( true );
	} );

	it( 'should create a new environment with full configuration from file', async () => {
		const expectedSlug = getProjectSlug();
		const expectedTitle = 'Test';
		const expectedMultisite = true;
		const expectedPhpVersion = '8.0';
		const expectedWordPressVersion = '6.1';
		const expectedElasticsearch = true;
		const expectedPhpMyAdmin = true;
		const expectedXDebug = true;
		const expectedMailpit = true;
		const expectedPhoton = true;

		expect( await checkEnvExists( expectedSlug ) ).toBe( false );

		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			'configuration-version': '0.preview-unstable',
			slug: expectedSlug,
			title: expectedTitle,
			multisite: expectedMultisite,
			php: expectedPhpVersion,
			wordpress: expectedWordPressVersion,
			elasticsearch: expectedElasticsearch,
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
			'mu-plugins': 'image',
			'app-code': 'image',
		} );

		const spawnOptions = {
			env,
			cwd: tmpWorkingDirectoryPath,
		};

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate ],
			spawnOptions,
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `Using environment ${ expectedSlug }` );
		expect( result.stderr ).toBe( '' );

		const data = readEnvironmentData( expectedSlug );
		expect( data ).toMatchObject( {
			siteSlug: expectedSlug,
			wpTitle: expectedTitle,
			multisite: expectedMultisite,
			mediaRedirectDomain: '',
			elasticsearch: expectedElasticsearch,
			xdebugConfig: '',
			php: expect.stringContaining( `:${ expectedPhpVersion }` ),
			muPlugins: expect.objectContaining( { mode: 'image' } ),
			appCode: expect.objectContaining( { mode: 'image' } ),
			wordpress: expect.objectContaining( { mode: 'image', tag: expectedWordPressVersion } ),
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
		} );

		return expect( checkEnvExists( expectedSlug ) ).resolves.toBe( true );
	} );

	it( 'should update the environment from file', async () => {
		const slug = getProjectSlug();
		const expectedElasticsearch = false;
		const expectedPhpMyAdmin = false;
		const expectedXDebug = false;
		const expectedMailpit = false;
		const expectedPhoton = false;

		expect( await checkEnvExists( slug ) ).toBe( false );

		// Setup initial environment
		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			'configuration-version': '0.preview-unstable',
			slug,
			elasticsearch: expectedElasticsearch,
			phpmyadmin: expectedPhpMyAdmin,
			xdebug: expectedXDebug,
			mailpit: expectedMailpit,
			photon: expectedPhoton,
		} );

		const spawnOptions = {
			env,
			cwd: tmpWorkingDirectoryPath,
		};

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate ], spawnOptions, true );
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
		} );

		// Update environment from changed configuration file
		await writeConfigurationFile( tmpWorkingDirectoryPath, {
			'configuration-version': '0.preview-unstable',
			slug,
			elasticsearch: ! expectedElasticsearch,
			phpmyadmin: ! expectedPhpMyAdmin,
			xdebug: ! expectedXDebug,
			mailpit: ! expectedMailpit,
			photon: ! expectedPhoton,
		} );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvUpdate ], spawnOptions, true );
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
		} );
	} );
} );
