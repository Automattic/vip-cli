import path from 'node:path';

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

	it( 'rejects a worker name together with --all', async () => {
		await expect( edgeWorkersBuildCommand( [ 'alpha' ], { all: true } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( exit.withError ).toHaveBeenCalledWith(
			'Supply either a worker name or --all, not both.'
		);
		expect( project.findWorker ).not.toHaveBeenCalled();
		expect( project.discoverWorkers ).not.toHaveBeenCalled();
		expect( lib.buildWorker ).not.toHaveBeenCalled();
	} );

	it( 'reports when the project has no workers', async () => {
		project.discoverWorkers.mockReturnValue( [] );

		await expect( edgeWorkersBuildCommand() ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( exit.withError ).toHaveBeenCalledWith(
			'No workers found in this project. Create one with `vip edge-workers new`.'
		);
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_error', {
			name: undefined,
			error: 'build_failed',
		} );
		expect( lib.buildWorker ).not.toHaveBeenCalled();
	} );

	it( 'keeps compiler diagnostics local and out of analytics', async () => {
		const secret = 'SENTINEL_BUILD_SECRET';
		const sourcePath = '/private/customer/project/workers/alpha/assembly/index.ts';
		const diagnostic = `Compilation failed at ${ sourcePath }: const token = "${ secret }";\n\u001b[31merror`;
		lib.buildWorker.mockImplementation( () => {
			throw new Error( diagnostic );
		} );

		await expect( edgeWorkersBuildCommand( [ 'alpha' ] ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_error', {
			name: 'alpha',
			error: 'build_failed',
		} );
		expect( JSON.stringify( tracker.trackEvent.mock.calls ) ).not.toContain( secret );
		expect( JSON.stringify( tracker.trackEvent.mock.calls ) ).not.toContain( sourcePath );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( secret ) );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( sourcePath ) );
		expect( tracker.trackEvent ).not.toHaveBeenCalledWith(
			'edge_workers_build_command_success',
			expect.anything()
		);
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'prints the relative artifact path and byte size', async () => {
		await edgeWorkersBuildCommand( [ 'alpha' ] );

		expect( console.log ).toHaveBeenCalledWith(
			`✓ Built "alpha" → ${ path.relative( '/project', '/project/build/alpha.wasm' ) } (5 bytes)`
		);
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_build_command_success', {
			count: 1,
		} );
		const buildOrder = lib.buildWorker.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEvent.mock.invocationCallOrder.at( -1 );
		expect( buildOrder ).toBeLessThan( successOrder );
	} );
} );
