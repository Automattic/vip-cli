import { edgeWorkersDisableCommand } from '../../src/bin/vip-edge-workers-disable';
import * as edgeWorkersApi from '../../src/lib/api/edge-workers';
import * as exit from '../../src/lib/cli/exit';
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

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = {
	app: { id: 1, name: 'example-app' },
	env: { id: 3, type: 'production' },
};

const worker = {
	id: 7,
	name: 'headers',
	location: null,
	phases: [ 'client_response' ],
	onFailure: 'continue',
	active: true,
	createdAt: '2026-08-19T00:00:00.000Z',
	updatedAt: '2026-08-19T00:00:00.000Z',
};

describe( 'edgeWorkersDisableCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( worker );
		edgeWorkersApi.setEdgeWorkerActive.mockResolvedValue( { ...worker, active: false } );
		tracker.trackEventWithEnv.mockResolvedValue();
	} );

	it( 'does not prompt or mutate when the worker is not found', async () => {
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( null );

		await expect( edgeWorkersDisableCommand( [ 'missing' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_disable_command_success',
			expect.anything()
		);
	} );

	it( 'reports API rejection without success output or telemetry', async () => {
		edgeWorkersApi.setEdgeWorkerActive.mockRejectedValue( new Error( 'API unavailable' ) );

		await expect( edgeWorkersDisableCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( confirm ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to disable edge worker: API unavailable'
		);
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_disable_command_error',
			{ name: 'headers', error: 'disable_failed' }
		);
		expect( console.log ).not.toHaveBeenCalledWith( '✓ Disabled edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_disable_command_success',
			expect.anything()
		);
	} );

	it( 'disables production immediately without prompting and reports success after the API', async () => {
		await edgeWorkersDisableCommand( [ 'headers' ], opts );

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.findEdgeWorkerByName ).toHaveBeenCalledWith( 1, 3, 'headers' );
		expect( edgeWorkersApi.setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 7, false );
		expect( console.log ).toHaveBeenCalledWith( '✓ Disabled edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_disable_command_success',
			{ name: 'headers' }
		);
		const mutationOrder = edgeWorkersApi.setEdgeWorkerActive.mock.invocationCallOrder[ 0 ];
		const outputOrder = console.log.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( mutationOrder ).toBeLessThan( outputOrder );
		expect( mutationOrder ).toBeLessThan( successOrder );
	} );
} );
