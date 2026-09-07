/* eslint-disable id-length */

import Docker from 'dockerode';
import { dockerComposify } from 'lando/lib/utils';

import { getDockerSocket } from '../../../src/lib/dev-environment/docker-utils';

/**
 * @typedef {import('dockerode').ContainerInfo} ContainerInfo
 */

export async function createDockerClient() {
	const socketPath = await getDockerSocket();
	return socketPath ? new Docker( { socketPath } ) : new Docker();
}

/**
 * @param {Docker} docker  Docker instance
 * @param {string} project Project slug
 * @return {Promise<ContainerInfo[]>} List of containers
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
 * @param {Docker}   docker Docker instance
 * @param {string[]} ids    List of container IDs to kill
 */
export async function killContainers( docker, ids ) {
	const containers = ids.map( id => docker.getContainer( id ) );
	await Promise.all( containers.map( container => container.remove( { force: true, v: true } ) ) );
}

/**
 * @param {Docker}           docker  Docker instance
 * @param {string|undefined} project Project slug
 */
export async function killProjectContainers( docker, project ) {
	if ( project ) {
		const containers = await getContainersForProject( docker, project );
		const ids = containers.map( containerInfo => containerInfo.Id );
		await killContainers( docker, ids );
	}
}
