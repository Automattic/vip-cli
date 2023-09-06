export class DockerMachineNotFoundError extends Error {
	constructor() {
		super( 'Docker machine not found' );
	}
}
