/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import getEnvVars from 'lib/envvar/api-get-all';

export default async function getEnvVar( appId, envId, name ) {
	const envvars = await getEnvVars( appId, envId );
	return envvars.find( ( { name: foundName } ) => name === foundName );
}
