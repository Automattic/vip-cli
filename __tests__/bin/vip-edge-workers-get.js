import { edgeWorkersGetCommand } from '../../src/bin/vip-edge-workers-get';
import * as edgeWorkersApi from '../../src/lib/api/edge-workers';
import * as exit from '../../src/lib/cli/exit';
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
	getEdgeWorker: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = {
	app: { id: 1, name: 'example-app' },
	env: { id: 3, type: 'production' },
	source: false,
};

const worker = {
	id: 7,
	name: 'headers',
	location: { operator: 'starts_with', value: '/api/' },
	phases: [ 'client_response' ],
	onFailure: 'continue',
	active: true,
	createdAt: '2026-08-18T00:00:00.000Z',
	updatedAt: '2026-08-19T00:00:00.000Z',
};

describe( 'edgeWorkersGetCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		edgeWorkersApi.getEdgeWorker.mockResolvedValue( worker );
		tracker.trackEventWithEnv.mockResolvedValue();
	} );

	it( 'requests default details without source and preserves key-value output', async () => {
		await edgeWorkersGetCommand( [ 'headers' ], opts );

		expect( edgeWorkersApi.getEdgeWorker ).toHaveBeenCalledWith( 1, 3, 'headers', {
			includeSource: false,
		} );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '+ Name: headers' ) );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( '+ Location: starts_with "/api/"' )
		);
		expect( console.log ).not.toHaveBeenCalledWith( '\nSource:' );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_get_command_success',
			{ name: 'headers' }
		);
		const apiOrder = edgeWorkersApi.getEdgeWorker.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( apiOrder ).toBeLessThan( successOrder );
	} );

	it( 'requests and prints stored source only for --source', async () => {
		edgeWorkersApi.getEdgeWorker.mockResolvedValue( {
			...worker,
			source: 'export default {};',
		} );

		await edgeWorkersGetCommand( [ 'headers' ], { ...opts, source: true } );

		expect( edgeWorkersApi.getEdgeWorker ).toHaveBeenCalledWith( 1, 3, 'headers', {
			includeSource: true,
		} );
		expect( console.log ).toHaveBeenCalledWith( '\nSource:' );
		expect( console.log ).toHaveBeenCalledWith( 'export default {};' );
	} );

	it( 'reports when explicitly requested source was not stored', async () => {
		edgeWorkersApi.getEdgeWorker.mockResolvedValue( { ...worker, source: null } );

		await edgeWorkersGetCommand( [ 'headers' ], { ...opts, source: true } );

		expect( console.log ).toHaveBeenCalledWith( '(no source stored)' );
	} );

	it( 'reports a missing worker without false success', async () => {
		edgeWorkersApi.getEdgeWorker.mockResolvedValue( null );

		await expect( edgeWorkersGetCommand( [ 'missing' ], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( exit.withError ).toHaveBeenCalledWith(
			'No edge worker named "missing" is deployed to this environment.'
		);
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_get_command_success',
			expect.anything()
		);
	} );

	it( 'reports API rejection without details or false success', async () => {
		edgeWorkersApi.getEdgeWorker.mockRejectedValue( new Error( 'API unavailable' ) );

		await expect( edgeWorkersGetCommand( [ 'headers' ], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to get edge worker: API unavailable' );
		expect( console.log ).not.toHaveBeenCalled();
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_get_command_success',
			expect.anything()
		);
	} );
} );
