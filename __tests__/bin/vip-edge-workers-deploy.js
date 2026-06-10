import { edgeWorkersDeployCommand } from '../../src/bin/vip-edge-workers-deploy';
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
	findEdgeWorkerByName: jest.fn(),
	createEdgeWorker: jest.fn(),
	updateEdgeWorker: jest.fn(),
	validateEdgeWorker: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers', () => ( {
	buildWorker: jest.fn(),
	readPrebuiltWorker: jest.fn(),
	readWorkerSource: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/project', () => ( {
	resolveProjectDir: jest.fn(),
	findWorker: jest.fn(),
	discoverWorkers: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = {
	app: { id: 1 },
	env: { id: 3 },
	skipBuild: true,
};

const worker = {
	dir: '/proj/workers/my-worker',
	manifest: { name: 'my-worker', entry: 'assembly/index.ts', on_failure: 'continue' },
};

describe( 'edgeWorkersDeployCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		project.resolveProjectDir.mockReturnValue( '/proj' );
		project.findWorker.mockReturnValue( worker );
		lib.readPrebuiltWorker.mockReturnValue( {
			wasmPath: '/proj/build/my-worker.wasm',
			base64: 'V0FTTQ==',
			sizeBytes: 5,
		} );
		lib.readWorkerSource.mockReturnValue( 'source code' );
		api.validateEdgeWorker.mockResolvedValue( {
			valid: true,
			phases: [ 'client_response' ],
			errors: [],
		} );
	} );

	it( 'creates a worker when none exists with that name', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( null );
		api.createEdgeWorker.mockResolvedValue( { id: 7, phases: [ 'response' ] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], opts );

		expect( api.createEdgeWorker ).toHaveBeenCalledWith( 3, {
			name: 'my-worker',
			wasmBinary: 'V0FTTQ==',
			onFailure: 'continue',
			source: 'source code',
		} );
		expect( api.updateEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'updates the worker when one already exists with that name', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( { id: 42 } );
		api.updateEdgeWorker.mockResolvedValue( { id: 42, phases: [ 'response' ] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], opts );

		expect( api.updateEdgeWorker ).toHaveBeenCalledWith( 3, 42, {
			name: 'my-worker',
			wasmBinary: 'V0FTTQ==',
			onFailure: 'continue',
			source: 'source code',
			location: null,
		} );
		expect( api.createEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'sends the manifest location on update, clearing it when absent', async () => {
		const location = { operator: 'starts_with', value: '/api/' };
		project.findWorker.mockReturnValue( {
			...worker,
			manifest: { ...worker.manifest, location },
		} );
		api.findEdgeWorkerByName.mockResolvedValue( { id: 42 } );
		api.updateEdgeWorker.mockResolvedValue( { id: 42, phases: [ 'response' ] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], opts );

		expect( api.updateEdgeWorker ).toHaveBeenCalledWith(
			3,
			42,
			expect.objectContaining( { location } )
		);
	} );

	it( 'omits location on create when the manifest has none', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( null );
		api.createEdgeWorker.mockResolvedValue( { id: 7, phases: [] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], opts );

		expect( api.createEdgeWorker ).toHaveBeenCalledWith(
			3,
			expect.not.objectContaining( { location: expect.anything() } )
		);
	} );

	it( 'omits source when --skip-source is set', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( null );
		api.createEdgeWorker.mockResolvedValue( { id: 7, phases: [] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], { ...opts, skipSource: true } );

		expect( lib.readWorkerSource ).not.toHaveBeenCalled();
		expect( api.createEdgeWorker ).toHaveBeenCalledWith(
			3,
			expect.not.objectContaining( { source: expect.anything() } )
		);
	} );

	it( 'validates against the env before uploading', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( null );
		api.createEdgeWorker.mockResolvedValue( { id: 7, phases: [] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], opts );

		expect( api.validateEdgeWorker ).toHaveBeenCalledWith( 3, 'V0FTTQ==' );
	} );

	it( 'aborts the upload when validation fails', async () => {
		api.validateEdgeWorker.mockResolvedValue( {
			valid: false,
			phases: [],
			errors: [ 'missing alloc export' ],
		} );

		await expect( edgeWorkersDeployCommand( [ 'my-worker' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);
		expect( api.createEdgeWorker ).not.toHaveBeenCalled();
		expect( api.updateEdgeWorker ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'missing alloc export' )
		);
	} );

	it( 'skips validation when --skip-validate is set', async () => {
		api.findEdgeWorkerByName.mockResolvedValue( null );
		api.createEdgeWorker.mockResolvedValue( { id: 7, phases: [] } );

		await edgeWorkersDeployCommand( [ 'my-worker' ], { ...opts, skipValidate: true } );

		expect( api.validateEdgeWorker ).not.toHaveBeenCalled();
		expect( api.createEdgeWorker ).toHaveBeenCalled();
	} );

	it( 'errors when no worker name and no --all is given', async () => {
		await expect( edgeWorkersDeployCommand( [], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'supply a worker name' )
		);
	} );
} );
