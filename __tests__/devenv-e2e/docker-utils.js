/* eslint-disable id-length */
/**
 * External dependencies
 */
import type Docker from 'dockerode';

/**
 * @param {Docker} docker Docker instance
 * @returns {Promise<Set<string>>} List of container IDs
 */
export async function getExistingContainers( docker ) {
	const containers = await docker.listContainers( { all: true } );
	return new Set( containers.map( containerInfo => containerInfo.Id ) );
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
 * @param {Set<string>} excluded List of container IDs to keep
 */
export async function killContainersExcept( docker, excluded ) {
	const existingContainers = await docker.listContainers( { all: true } );
	const containers = new Set( existingContainers.map( containerInfo => containerInfo.Id ) );

	for ( const id of excluded ) {
		containers.delete( id );
	}

	return killContainers( docker, Array.from( containers ) );
}
