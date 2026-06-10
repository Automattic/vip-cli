import { edgeWorkersValidateCommand } from '../../src/bin/vip-edge-workers-validate';
import * as api from '../../src/lib/api/edge-workers';
import * as exit from '../../src/lib/cli/exit';
import * as lib from '../../src/lib/edge-workers';
import * as project from '../../src/lib/edge-workers/project';

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

jest.mock( '../../src/lib/api/edge-workers', () => ( {
	appQuery: '',
	validateEdgeWorker: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers', () => ( {
	buildWorker: jest.fn(),
	readPrebuiltWorker: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/project', () => ( {
	resolveProjectDir: jest.fn(),
	findWorker: jest.fn(),
	discoverWorkers: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = { app: { id: 1 }, env: { id: 3 } };

const worker = {
	dir: '/proj/workers/my-worker',
	manifest: { name: 'my-worker', entry: 'assembly/index.ts' },
};

describe( 'edgeWorkersValidateCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		project.resolveProjectDir.mockReturnValue( '/proj' );
		project.findWorker.mockReturnValue( worker );
		lib.buildWorker.mockReturnValue( {
			wasmPath: '/proj/build/my-worker.wasm',
			base64: 'V0FTTQ==',
		} );
		api.validateEdgeWorker.mockResolvedValue( {
			valid: true,
			phases: [ 'client_response' ],
			errors: [],
		} );
	} );

	it( 'builds and validates the worker against the env', async () => {
		await edgeWorkersValidateCommand( [ 'my-worker' ], opts );

		expect( lib.buildWorker ).toHaveBeenCalledWith( '/proj', worker );
		expect( api.validateEdgeWorker ).toHaveBeenCalledWith( 3, 'V0FTTQ==' );
		expect( exit.withError ).not.toHaveBeenCalled();
	} );

	it( 'uses the prebuilt artifact with --skip-build', async () => {
		lib.readPrebuiltWorker.mockReturnValue( {
			wasmPath: '/proj/build/my-worker.wasm',
			base64: 'UFJF',
		} );

		await edgeWorkersValidateCommand( [ 'my-worker' ], { ...opts, skipBuild: true } );

		expect( lib.buildWorker ).not.toHaveBeenCalled();
		expect( api.validateEdgeWorker ).toHaveBeenCalledWith( 3, 'UFJF' );
	} );

	it( 'exits with an error when a worker is invalid', async () => {
		api.validateEdgeWorker.mockResolvedValue( {
			valid: false,
			phases: [],
			errors: [ 'missing alloc export' ],
		} );

		await expect( edgeWorkersValidateCommand( [ 'my-worker' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( 'failed validation' ) );
	} );

	it( 'validates every worker with --all', async () => {
		project.discoverWorkers.mockReturnValue( [
			worker,
			{ dir: '/proj/workers/other', manifest: { name: 'other', entry: 'assembly/index.ts' } },
		] );

		await edgeWorkersValidateCommand( [], { ...opts, all: true } );

		expect( api.validateEdgeWorker ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'errors when no worker name and no --all is given', async () => {
		await expect( edgeWorkersValidateCommand( [], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'supply a worker name' )
		);
	} );
} );
