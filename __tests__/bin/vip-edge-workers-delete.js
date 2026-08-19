import { edgeWorkersDeleteCommand } from '../../src/bin/vip-edge-workers-delete';
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
	deleteEdgeWorker: jest.fn(),
	findEdgeWorkerByName: jest.fn(),
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
	force: false,
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

describe( 'edgeWorkersDeleteCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( worker );
		edgeWorkersApi.deleteEdgeWorker.mockResolvedValue();
		confirm.mockResolvedValue( true );
		tracker.trackEventWithEnv.mockResolvedValue();
	} );

	it( 'resolves the target and does not prompt or delete when it is not found', async () => {
		edgeWorkersApi.findEdgeWorkerByName.mockResolvedValue( null );

		await expect( edgeWorkersDeleteCommand( [ 'missing' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( edgeWorkersApi.findEdgeWorkerByName ).toHaveBeenCalledWith( 1, 3, 'missing' );
		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.deleteEdgeWorker ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_delete_command_success',
			expect.anything()
		);
	} );

	it( 'confirms the exact resolved target before deleting', async () => {
		const order = [];
		edgeWorkersApi.findEdgeWorkerByName.mockImplementation( async () => {
			order.push( 'resolve' );
			return worker;
		} );
		confirm.mockImplementation( async message => {
			expect( message ).toBe(
				'Permanently delete edge worker "headers" from example-app.production?'
			);
			order.push( 'confirm' );
			return true;
		} );
		edgeWorkersApi.deleteEdgeWorker.mockImplementation( async () => {
			order.push( 'delete' );
		} );

		await edgeWorkersDeleteCommand( [ 'headers' ], opts );

		expect( order ).toEqual( [ 'resolve', 'confirm', 'delete' ] );
	} );

	it( 'does not delete when confirmation is declined', async () => {
		confirm.mockResolvedValue( false );

		await expect( edgeWorkersDeleteCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( edgeWorkersApi.deleteEdgeWorker ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to delete edge worker: Command cancelled by user.'
		);
	} );

	it( 'uses force as the explicit prompt bypass', async () => {
		await edgeWorkersDeleteCommand( [ 'headers' ], { ...opts, force: true } );

		expect( confirm ).not.toHaveBeenCalled();
		expect( edgeWorkersApi.deleteEdgeWorker ).toHaveBeenCalledWith( 3, 7 );
	} );

	it( 'reports API rejection without success output or telemetry', async () => {
		edgeWorkersApi.deleteEdgeWorker.mockRejectedValue( new Error( 'API unavailable' ) );

		await expect( edgeWorkersDeleteCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to delete edge worker: API unavailable'
		);
		expect( console.log ).not.toHaveBeenCalledWith( '✓ Deleted edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_delete_command_success',
			expect.anything()
		);
	} );

	it( 'prints and tracks success only after deletion succeeds', async () => {
		await edgeWorkersDeleteCommand( [ 'headers' ], opts );

		expect( edgeWorkersApi.deleteEdgeWorker ).toHaveBeenCalledWith( 3, 7 );
		expect( console.log ).toHaveBeenCalledWith( '✓ Deleted edge worker "headers".' );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_delete_command_success',
			{ name: 'headers' }
		);
		const deletionOrder = edgeWorkersApi.deleteEdgeWorker.mock.invocationCallOrder[ 0 ];
		const outputOrder = console.log.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( deletionOrder ).toBeLessThan( outputOrder );
		expect( deletionOrder ).toBeLessThan( successOrder );
	} );
} );
