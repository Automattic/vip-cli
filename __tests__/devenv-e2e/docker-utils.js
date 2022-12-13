/* eslint-disable id-length */
/**
 * External dependencies
 */
import Docker from 'dockerode';

/**
 * @param {Docker} docker Docker instance
 * @returns {Promise<string[]>} List of container IDs
 */
export async function getExistingContainers( docker ) {
	const containers = await docker.listContainers( { all: true } );
	return containers.map( containerInfo => containerInfo.Id );
}

/**
 * @param {Docker} docker Docker instance
 * @param {string[]} ids List of container IDs
 */
export async function killContainers( docker, ids ) {
	const containers = ids.map( id => docker.getContainer( id ) );
	await Promise.all( containers.map( container => container.remove( { force: true, v: true } ) ) );
}
