import { edgeWorkersBuildCommand } from '../../src/bin/vip-edge-workers-build';
import * as exit from '../../src/lib/cli/exit';
import * as lib from '../../src/lib/edge-workers';
import * as project from '../../src/lib/edge-workers/project';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT_WITH_ERROR';
} );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/edge-workers', () => ( {
	buildWorker: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/project', () => ( {
	discoverWorkers: jest.fn(),
	findWorker: jest.fn(),
	resolveProjectDir: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

const worker = name => ( {
	dir: `/project/workers/${ name }`,
	manifest: { name, entry: 'assembly/index.ts' },
} );

describe( 'edgeWorkersBuildCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		project.resolveProjectDir.mockReturnValue( '/project' );
		project.findWorker.mockImplementation( ( _projectDir, name ) => worker( name ) );
		project.discoverWorkers.mockReturnValue( [ worker( 'alpha' ), worker( 'beta' ) ] );
		lib.buildWorker.mockImplementation( ( _projectDir, selectedWorker ) => ( {
			wasmPath: `/project/build/${ selectedWorker.manifest.name }.wasm`,
			sizeBytes: selectedWorker.manifest.name.length,
		} ) );
	} );

	it( 'builds one named worker', async () => {
		await edgeWorkersBuildCommand( [ 'alpha' ] );

		expect( project.findWorker ).toHaveBeenCalledWith( '/project', 'alpha' );
		expect( project.discoverWorkers ).not.toHaveBeenCalled();
		expect( lib.buildWorker ).toHaveBeenCalledWith( '/project', worker( 'alpha' ) );
	} );

	it( 'builds all discovered workers when no name is supplied', async () => {
		await edgeWorkersBuildCommand();

		expect( project.discoverWorkers ).toHaveBeenCalledWith( '/project' );
		expect( lib.buildWorker ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'builds all discovered workers with --all', async () => {
		await edgeWorkersBuildCommand( [], { all: true } );

		expect( project.discoverWorkers ).toHaveBeenCalledWith( '/project' );
		expect( lib.buildWorker ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'reports when the project has no workers', async () => {
		project.discoverWorkers.mockReturnValue( [] );

		await expect( edgeWorkersBuildCommand() ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( exit.withError ).toHaveBeenCalledWith(
			'No workers found in this project. Create one with `vip edge-workers new`.'
		);
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_error', {
			name: undefined,
			error: 'No workers found in this project. Create one with `vip edge-workers new`.',
		} );
		expect( lib.buildWorker ).not.toHaveBeenCalled();
	} );

	it( 'reports a build failure without success telemetry', async () => {
		lib.buildWorker.mockImplementation( () => {
			throw new Error( 'compiler failed' );
		} );

		await expect( edgeWorkersBuildCommand( [ 'alpha' ] ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_error', {
			name: 'alpha',
			error: 'compiler failed',
		} );
		expect( tracker.trackEvent ).not.toHaveBeenCalledWith(
			'edge_workers_build_command_success',
			expect.anything()
		);
	} );

	it( 'prints the relative artifact path and byte size', async () => {
		await edgeWorkersBuildCommand( [ 'alpha' ] );

		expect( console.log ).toHaveBeenCalledWith( '✓ Built "alpha" → build/alpha.wasm (5 bytes)' );
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_success', {
			count: 1,
		} );
	} );
} );
