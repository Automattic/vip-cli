/* eslint-disable valid-jsdoc */
/**
 * External dependencies
 */
import { expect } from '@jest/globals';

/**
 * Internal dependencies
 */
import { doesEnvironmentExist } from '../../../src/lib/dev-environment/dev-environment-core';
import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart } from './commands';

let id = 0;

/**
 * @returns {string} Project slug
 */
export function getProjectSlug() {
	++id;
	const workerID = `${ +( process.env.JEST_WORKER_ID || '1' ) }`.padStart( 4, '0' );
	const envID = `${ id }`.padStart( 4, '0' );
	return `dev-env-${ workerID }-${ envID }`;
}

/**
 * @param {string|undefined} xdgDataHome XDG Data Home
 * @returns {NodeJS.ProcessEnv} Environment
 */
export function prepareEnvironment( xdgDataHome ) {
	const env = {};

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
 * `doesEnvironmentExist()` will need `getEnvironmentPath()` after #1201 gets merged.
 *
 * @param {string} slug Environment slug
 * @returns {boolean} Whether the environment exists
 */
export function checkEnvExists( slug ) {
	return doesEnvironmentExist( slug );
}

/**
 * @param {import('./cli-test').CliTest} cliTest CLI Test instance
 * @param {string} slug Environment slug
 * @param {NodeJS.ProcessEnv} env Environment
 * @param {string[]} options Environment creation options
 */
export async function createAndStartEnvironment( cliTest, slug, env, options = [] ) {
	let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ].concat( options ), { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
	expect( checkEnvExists( slug ) ).toBe( true );

	result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toMatch( /STATUS\s+UP/u );
}

/**
 * @param {import('./cli-test').CliTest} cliTest CLI Test instance
 * @param {string} slug Environment slug
 * @param {NodeJS.ProcessEnv} env Environment
 */
export async function destroyEnvironment( cliTest, slug, env ) {
	const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( 'Environment files deleted successfully' );
	expect( result.stdout ).toContain( 'Environment destroyed' );
	expect( checkEnvExists( slug ) ).toBe( false );
}
