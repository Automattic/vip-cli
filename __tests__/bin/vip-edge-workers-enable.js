import { edgeWorkersEnableCommand } from '../../src/bin/vip-edge-workers-enable';
import * as edgeWorkersApi from '../../src/lib/api/edge-workers';
import * as exit from '../../src/lib/cli/exit';
import * as confirmation from '../../src/lib/edge-workers/confirmation';
import { confirm } from '../../src/lib/envvar/input';
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
	appQuery: 'mock-app-query',
	findEdgeWorkerByName: jest.fn(),
	setEdgeWorkerActive: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/input', () => ( {
	confirm: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/confirmation', () => {
	const actual = jest.requireActual( '../../src/lib/edge-workers/confirmation' );
	return {
		...actual,
		isInteractiveEdgeWorkers: jest.fn(),
	};
} );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = {
	app: { id: 1, name: 'example-app' },
	env: { id: 3, type: 'production' },
	skipConfirmation: false,
};

const worker = {
	id: 7,
	name: 'headers',
	location: null,
	phases: [ 'client_response' ],
	onFailure: 'continue',
	active: false,
	createdAt: '2026-08-19T00:00:00.000Z',
	updatedAt: '2026-08-19T00:00:00.000Z',
};

describe( 'edgeWorkersEnableCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( worker );
		edgeWorkersApi.setEdgeWorkerActive.mockResolvedValue( { ...worker, active: true } );
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( true );
		confirm.mockResolvedValue( true );
		tracker.trackEventWithEnv.mockResolvedValue();
	} );

	it( 'does not prompt or mutate when the worker is not found', async () => {
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( null );

		await expect( edgeWorkersEnableCommand( [ 'missing' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_enable_command_success',
			expect.anything()
		);
	} );

	it( 'enables a non-production worker without prompting', async () => {
		await edgeWorkersEnableCommand( [ 'headers' ], {
			...opts,
			env: { id: 3, type: 'develop' },
		} );

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 7, true );
	} );

	it( 'confirms the exact production worker before enabling it', async () => {
		const order = [];
		confirm.mockImplementation( async message => {
			expect( message ).toBe( 'Enable edge worker "headers" on example-app.production?' );
			order.push( 'confirm' );
			return true;
		} );
		edgeWorkersApi.setEdgeWorkerActive.mockImplementation( async () => {
			order.push( 'mutation' );
			return { ...worker, active: true };
		} );

		await edgeWorkersEnableCommand( [ 'headers' ], opts );

		expect( order ).toEqual( [ 'confirm', 'mutation' ] );
		expect( confirmation.isInteractiveEdgeWorkers ).toHaveBeenCalledWith( opts );
	} );

	it( 'refuses non-interactive production before enabling', async () => {
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( false );

		await expect( edgeWorkersEnableCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringMatching( /Refusing to enable.*production/ )
		);
	} );

	it( 'allows explicit production confirmation bypass', async () => {
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( false );

		await edgeWorkersEnableCommand( [ 'headers' ], { ...opts, skipConfirmation: true } );

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 7, true );
	} );

	it( 'reports API rejection without success output or telemetry', async () => {
		edgeWorkersApi.setEdgeWorkerActive.mockRejectedValue( new Error( 'API unavailable' ) );

		await expect( edgeWorkersEnableCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to enable edge worker: API unavailable'
		);
		expect( console.log ).not.toHaveBeenCalledWith( '✓ Enabled edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_enable_command_success',
			expect.anything()
		);
	} );

	it( 'prints and tracks success only after the confirmed API mutation succeeds', async () => {
		await edgeWorkersEnableCommand( [ 'headers' ], opts );

		expect( edgeWorkersApi.findEdgeWorkerByName ).toHaveBeenCalledWith( 1, 3, 'headers' );
		expect( edgeWorkersApi.setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 7, true );
		expect( console.log ).toHaveBeenCalledWith( '✓ Enabled edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_enable_command_success',
			{ name: 'headers' }
		);
		const mutationOrder = edgeWorkersApi.setEdgeWorkerActive.mock.invocationCallOrder[ 0 ];
		const outputOrder = console.log.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( mutationOrder ).toBeLessThan( outputOrder );
		expect( mutationOrder ).toBeLessThan( successOrder );
	} );
} );
