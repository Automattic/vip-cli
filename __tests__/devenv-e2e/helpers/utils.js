import { expect } from '@jest/globals';
import { dump } from 'js-yaml';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart } from './commands';
import { CONFIGURATION_FOLDER } from '../../../src/lib/dev-environment/dev-environment-cli';
import { CONFIGURATION_FILE_NAME } from '../../../src/lib/dev-environment/dev-environment-configuration-file';
import {
	doesEnvironmentExist,
	getEnvironmentPath,
} from '../../../src/lib/dev-environment/dev-environment-core';

let id = 0;

/**
 * @return {string} Project slug
 */
export function getProjectSlug() {
	++id;
	const workerID = `${ Number( process.env.JEST_WORKER_ID || '1' ) }`.padStart( 4, '0' );
	const envID = `${ id }`.padStart( 4, '0' );
	return `dev-env-${ workerID }-${ envID }`;
}

/**
 * @param {string|undefined} xdgDataHome XDG Data Home
 * @return {NodeJS.ProcessEnv} Environment
 */
export function prepareEnvironment( xdgDataHome ) {
	const env = {
		DO_NOT_TRACK: '1',
	};

	[ 'HOME', 'PATH', 'HOSTNAME', 'DOCKER_HOST' ].forEach( key => {
		if ( process.env[ key ] ) {
			env[ key ] = process.env[ key ];
		}
	} );

	if ( xdgDataHome ) {
		env.XDG_DATA_HOME = xdgDataHome;
	}

	return env;
}

/**
 * @param {string} slug Environment slug
 * @return {Promise<boolean>} Whether the environment exists
 */
export function checkEnvExists( slug ) {
	return doesEnvironmentExist( getEnvironmentPath( slug ) );
}

/**
 * @param {import('./cli-test').CliTest} cliTest CLI Test instance
 * @param {string}                       slug    Environment slug
 * @param {NodeJS.ProcessEnv}            env     Environment
 * @param {string[]}                     options Environment creation options
 */
export async function createAndStartEnvironment( cliTest, slug, env, options = [] ) {
	let result = await cliTest.spawn(
		[ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ].concat( options ),
		{ env },
		true
	);
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
	expect( await checkEnvExists( slug ) ).toBe( true );

	result = await cliTest.spawn(
		[ process.argv[ 0 ], vipDevEnvStart, '--slug', slug, '-w' ],
		{ env },
		true
	);
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toMatch( /STATUS\s+UP/u );
}

/**
 * @param {import('./cli-test').CliTest} cliTest CLI Test instance
 * @param {string}                       slug    Environment slug
 * @param {NodeJS.ProcessEnv}            env     Environment
 */
export async function destroyEnvironment( cliTest, slug, env ) {
	const result = await cliTest.spawn(
		[ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ],
		{ env },
		true
	);
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( 'Environment files deleted successfully' );
	expect( result.stdout ).toContain( 'Environment destroyed' );
	expect( await checkEnvExists( slug ) ).toBe( false );
}

/**
 * @param {string} workingDirectoryPath Directory path that will contain the configuration file
 * @param {Object} configuration        Configuration file values
 */
export async function writeConfigurationFile( workingDirectoryPath, configuration ) {
	const configurationDirectoryPath = path.join( workingDirectoryPath, CONFIGURATION_FOLDER );
	await mkdir( configurationDirectoryPath, { recursive: true } );

	const configurationLines = dump( configuration );
	await writeFile(
		path.join( configurationDirectoryPath, CONFIGURATION_FILE_NAME ),
		configurationLines,
		'utf8'
	);
}

/**
 * Add required appCode directories for environment mapping.
 *
 * @param {string} workingDirectoryPath Path that represents the root of a VIP application
 */
export async function makeRequiredAppCodeDirectories( workingDirectoryPath ) {
	// Add folders to root project so that 'appCode' option verifies
	const appCodeDirectories = [
		'languages',
		'plugins',
		'themes',
		'private',
		'images',
		'client-mu-plugins',
		'vip-config',
	];

	return Promise.all(
		appCodeDirectories.map( dir => mkdir( path.join( workingDirectoryPath, dir ) ) )
	);
}
