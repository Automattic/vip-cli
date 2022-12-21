/**
 * External dependencies
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, jest } from '@jest/globals';
import xdgBaseDir from 'xdg-basedir';

/**
 * Internal dependencies
 */
import { CliTest } from './helpers/cli-test';
import { checkEnvExists, getProjectSlug, prepareEnvironment } from './helpers/utils';
import { vipDevEnvCreate, vipDevEnvImportMedia } from './helpers/commands';
import { getEnvironmentPath } from '../../src/lib/dev-environment/dev-environment-core';

jest.setTimeout( 30 * 1000 );

describe( 'vip dev-env import media', () => {
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

	it( 'should fail if environment does not exist', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvImportMedia, '--slug', slug, __dirname ], { env } );
		expect( result.rc ).toBeGreaterThan( 0 );
		expect( result.stderr ).toContain( 'Error: Environment doesn\'t exist.' );
	} );

	it( 'should copy files if environment exists', async () => {
		const slug = getProjectSlug();
		expect( checkEnvExists( slug ) ).toBe( false );

		let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ], { env }, true );
		expect( result.rc ).toBe( 0 );
		expect( checkEnvExists( slug ) ).toBe( true );

		result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvImportMedia, '--slug', slug, __dirname ], { env } );
		expect( result.rc ).toBe( 0 );

		const uploadsPath = path.join( getEnvironmentPath( slug ), 'uploads' );
		const file = path.join( uploadsPath, path.basename( __filename ) );

		// eslint-disable-next-line jest/no-truthy-falsy
		return expect( stat( file ) ).resolves.toBeTruthy();
	} );
} );
