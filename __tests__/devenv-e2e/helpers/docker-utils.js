/* eslint-disable id-length */

import { dockerComposify } from 'lando/lib/utils';

import { ownsProject } from './identity';

/**
 * @typedef {import('dockerode')} Docker
 * @typedef {import('dockerode').ContainerInfo} ContainerInfo
 */

/**
 * @param {Docker} docker  Docker instance
 * @param {string} project Project slug
 * @param {boolean} all Include stopped containers
 * @return {Promise<ContainerInfo[]>} List of containers
 */
export function getContainersForProject( docker, project, all = false ) {
	const prefix = dockerComposify( project );
	return docker.listContainers( {
		all,
		filters: {
			label: [ `com.docker.compose.project=${ prefix }` ],
		},
	} );
}

/**
 * @param {Docker}   docker Docker instance
 * @param {string[]} ids    List of container IDs to kill
 */
async function killContainers( docker, ids ) {
	const containers = ids.map( id => docker.getContainer( id ) );
	await Promise.all( containers.map( container => container.remove( { force: true, v: true } ) ) );
}

/**
 * @param {Docker}           docker  Docker instance
 * @param {string|undefined} project Project slug
 */
export async function killProjectContainers( docker, project ) {
	if ( project ) {
		if ( ! ownsProject( project ) ) {
			throw new Error( 'Refusing to remove containers outside this E2E invocation' );
		}
		const containers = await getContainersForProject( docker, project, true );
		const expectedProject = dockerComposify( project );
		if (
			containers.some(
				container => container.Labels?.[ 'com.docker.compose.project' ] !== expectedProject
			)
		) {
			throw new Error( 'Refusing to remove containers with unexpected project ownership' );
		}
		const ids = containers.map( containerInfo => containerInfo.Id );
		await killContainers( docker, ids );
	}
}
