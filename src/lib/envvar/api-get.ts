/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import getEnvVars from '../../lib/envvar/api-get-all';
import type { EnvironmentVariable } from '../../graphqlTypes';

export default async function getEnvVar(
	appId: number,
	envId: number,
	name: string
): Promise< EnvironmentVariable | undefined > {
	const envvars = await getEnvVars( appId, envId );
	return envvars?.find( ( { name: foundName } ) => name === foundName );
}
