/**
 * External dependencies
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import {
	checkEnvExists,
	createAndStartEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvList } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';
import { getEnvironmentPath } from '../../src/lib/dev-environment/dev-environment-core';

jest.setTimeout( 60 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

// Allow (validated) unsafe regexp in tests.
/* eslint-disable security/detect-non-literal-regexp */

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
		expect( await checkEnvExists( slug1 ) ).toBe( false );
		expect( await checkEnvExists( slug2 ) ).toBe( false );

		let result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug1 ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug1 }` );
		expect( await checkEnvExists( slug1 ) ).toBe( true );

		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug2 ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug2 }` );
		expect( await checkEnvExists( slug2 ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( 'Found 2 environments' );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug1 }` ) );
		expect( result.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug2 }` ) );
		expect( result.stdout ).toMatch( /STATUS\s+DOWN/ );
		expect( result.stdout ).not.toMatch( /STATUS\s+UP/ );
	} );

	it( 'should be able to handle missing .lando.yml', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( await checkEnvExists( slug ) ).toBe( true );

		await rm( path.join( getEnvironmentPath( slug ), '.lando.yml' ) );

		const result2 = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result2.rc ).toBe( 0 );
		expect( result2.stdout ).toContain( 'Found 1 environments' );
		expect( result2.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
		expect( result2.stdout ).toMatch( /STATUS\s+DOWN/ );
		expect( result2.stdout ).not.toMatch( /STATUS\s+UP/ );

		// Lando sends everything to stdout :-(
		expect( result2.stdout ).toContain( 'could not find app in this dir' );
		expect( result2.stderr ).toContain(
			'There was an error initializing Lando, trying to recover'
		);
		expect( result2.stderr ).toContain( 'Recovery successful, trying to initialize again' );
		expect( result2.stderr ).not.toContain( 'Backed up' );
	} );

	it( 'should be able to handle corrupt .lando.yml', async () => {
		const slug = getProjectSlug();
		expect( await checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
		expect( await checkEnvExists( slug ) ).toBe( true );

		const filename = path.join( getEnvironmentPath( slug ), '.lando.yml' );
		let data = await readFile( filename, 'utf8' );
		data = data.replace( /type: compose/gu, 'type: composer' );
		await writeFile( filename, data );
		const result2 = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvList ], { env }, true );
		expect( result2.rc ).toBe( 0 );
		expect( result2.stdout ).toContain( 'Found 1 environments' );
		expect( result2.stdout ).toMatch( new RegExp( `SLUG\\s+${ slug }` ) );
		expect( result2.stdout ).toMatch( /STATUS\s+DOWN/ );
		expect( result2.stdout ).not.toMatch( /STATUS\s+UP/ );

		// Lando sends everything to stdout :-(
		expect( result2.stdout ).toContain( 'composer is not a supported service type' );
		expect( result2.stderr ).toContain(
			'There was an error initializing Lando, trying to recover'
		);
		expect( result2.stderr ).toContain( 'Recovery successful, trying to initialize again' );
		expect( result2.stderr ).toContain( 'Backed up' );
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
