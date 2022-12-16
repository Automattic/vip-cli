/* eslint-disable id-length */

/**
 * @typedef {import('dockerode')} Docker
 * @typedef {import('dockerode').ContainerInfo} ContainerInfo
 */

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
 * @param {Set<string>} knownContainers List of container IDs to ignore
 * @returns {Promise<ContainerInfo[]>} List of new containers
 */
export async function getNewContainers( docker, knownContainers ) {
	const existingContainers = await docker.listContainers( { all: true } );
	return existingContainers.filter( containerInfo => ! knownContainers.has( containerInfo.Id ) );
}

/**
 * @param {Docker} docker Docker instance
 * @param {string} project Project slug
 * @returns {Promise<ContainerInfo[]>} List of containers
 */
export function getContainersForProject( docker, project ) {
	const prefix = project.replace( /-/g, '' );
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
 * @param {Set<string>} excluded List of container IDs to keep
 */
export async function killContainersExcept( docker, excluded ) {
	const newContainers = await getNewContainers( docker, excluded );
	const ids = newContainers.map( containerInfo => containerInfo.Id );
	return killContainers( docker, ids );
}
