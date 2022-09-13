/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { getEnvIdentifier } from 'lib/cli/command';

// Shared debugger.
export const debug = debugLib( '@automattic/vip:bin:config:envvar' );

export function getEnvContext( app, env ) {
	return `@${ app.id }.${ getEnvIdentifier( env ) }`;
}
