/* eslint-disable id-length */

/**
 * External dependencies
 */
import { dockerComposify } from 'lando/lib/utils';

/**
 * @typedef {import('dockerode')} Docker
 * @typedef {import('dockerode').ContainerInfo} ContainerInfo
 */

/**
 * @param {Docker} docker Docker instance
 * @param {string} project Project slug
 * @returns {Promise<ContainerInfo[]>} List of containers
 */
export function getContainersForProject( docker, project ) {
	const prefix = dockerComposify( project );
	return docker.listContainers( {
		filters: {
			label: [ `com.docker.compose.project=${ prefix }` ],
		},
	} );
}

/**
 * @param {Docker} docker Docker instance
 * @param {string[]} ids List of container IDs to kill
 */
export async function killContainers( docker, ids ) {
	const containers = ids.map( id => docker.getContainer( id ) );
	await Promise.all( containers.map( container => container.remove( { force: true, v: true } ) ) );
}

/**
 * @param {Docker} docker Docker instance
 * @param {string|undefined} project Project slug
 */
export async function killProjectContainers( docker, project ) {
	if ( project ) {
		const containers = await getContainersForProject( docker, project );
		const ids = containers.map( containerInfo => containerInfo.Id );
		await killContainers( docker, ids );
	}
}
