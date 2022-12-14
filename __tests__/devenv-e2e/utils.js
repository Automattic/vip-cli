/**
 * Internal dependencies
 */
import { doesEnvironmentExist } from '../../src/lib/dev-environment/dev-environment-core';

let id = 0;

/**
 * @returns {number} Next ID
 */
export function getNextID() {
	++id;
	return id;
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
