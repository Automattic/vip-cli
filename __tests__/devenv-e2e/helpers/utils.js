/* eslint-disable jsdoc/valid-types */

/**
 * External dependencies
 */
import { expect } from '@jest/globals';

/**
 * Internal dependencies
 */
import { doesEnvironmentExist, getEnvironmentPath } from '../../../src/lib/dev-environment/dev-environment-core';
import { vipDevEnvCreate, vipDevEnvDestroy, vipDevEnvStart } from './commands';

let id = 0;

/**
 * @return {string} Project slug
 */
export function getProjectSlug() {
	++id;
	const workerID = `${ +( process.env.JEST_WORKER_ID || '1' ) }`.padStart( 4, '0' );
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
	let result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvCreate, '--slug', slug ].concat( options ), { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( `vip dev-env start --slug ${ slug }` );
	expect( await checkEnvExists( slug ) ).toBe( true );

	result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvStart, '--slug', slug ], { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toMatch( /STATUS\s+UP/u );
}

/**
 * @param {import('./cli-test').CliTest} cliTest CLI Test instance
 * @param {string}                       slug    Environment slug
 * @param {NodeJS.ProcessEnv}            env     Environment
 */
export async function destroyEnvironment( cliTest, slug, env ) {
	const result = await cliTest.spawn( [ process.argv[ 0 ], vipDevEnvDestroy, '--slug', slug ], { env }, true );
	expect( result.rc ).toBe( 0 );
	expect( result.stdout ).toContain( 'Environment files deleted successfully' );
	expect( result.stdout ).toContain( 'Environment destroyed' );
	expect( await checkEnvExists( slug ) ).toBe( false );
}
