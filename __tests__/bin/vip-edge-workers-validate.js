import { edgeWorkersValidateCommand } from '../../src/bin/vip-edge-workers-validate';
import * as api from '../../src/lib/api/edge-workers';
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
		const validationOrder = api.validateEdgeWorker.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( validationOrder ).toBeLessThan( successOrder );
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
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_validate_command_success',
			expect.anything()
		);
	} );

	it( 'does not report validation success when the API rejects', async () => {
		api.validateEdgeWorker.mockRejectedValue(
			new Error( 'validateEdgeWorker returned no result.' )
		);

		await expect( edgeWorkersValidateCommand( [ 'my-worker' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( console.log ).not.toHaveBeenCalledWith( expect.stringContaining( 'is valid' ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_validate_command_success',
			expect.anything()
		);
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'keeps compiler diagnostics local and out of analytics', async () => {
		const secret = 'SENTINEL_VALIDATE_SECRET';
		const sourcePath = '/private/customer/project/workers/my-worker/assembly/index.ts';
		lib.buildWorker.mockImplementation( () => {
			throw new Error( `Compiler printed ${ sourcePath }: ${ secret }\n\u001b[31merror` );
		} );

		await expect( edgeWorkersValidateCommand( [ 'my-worker' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_validate_command_error',
			{ name: 'my-worker', error: 'validate_failed' }
		);
		expect( JSON.stringify( tracker.trackEventWithEnv.mock.calls ) ).not.toContain( secret );
		expect( JSON.stringify( tracker.trackEventWithEnv.mock.calls ) ).not.toContain( sourcePath );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( secret ) );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( sourcePath ) );
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
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'supply a worker name' )
		);
	} );
} );
