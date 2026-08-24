import { edgeWorkersListCommand } from '../../src/bin/vip-edge-workers-list';
import * as api from '../../src/lib/api/edge-workers';
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
	appQuery: '',
	listEdgeWorkers: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = { app: { id: 1 }, env: { id: 3 }, format: 'table' };

describe( 'edgeWorkersListCommand()', () => {
	beforeEach( jest.clearAllMocks );

	it( 'maps workers into flat, formattable rows', async () => {
		api.listEdgeWorkers.mockResolvedValue( [
			{
				id: 5,
				name: 'headers',
				active: true,
				phases: [ 'client_response' ],
				location: { operator: 'starts_with', value: '/api/' },
				onFailure: 'continue',
				updatedAt: '2026-06-04',
			},
		] );

		const rows = await edgeWorkersListCommand( [], opts );

		expect( rows ).toEqual( [
			{
				id: 5,
				name: 'headers',
				active: 'yes',
				phases: 'client_response',
				location: 'starts_with "/api/"',
				on_failure: 'continue',
				modified: '2026-06-04',
			},
		] );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_list_command_success',
			{ count: 1 }
		);
		const apiOrder = api.listEdgeWorkers.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( apiOrder ).toBeLessThan( successOrder );
	} );

	it( 'shows a friendly message and returns an empty array when there are none', async () => {
		api.listEdgeWorkers.mockResolvedValue( [] );

		const rows = await edgeWorkersListCommand( [], opts );

		expect( rows ).toEqual( [] );
		expect( console.log ).toHaveBeenCalledWith(
			'No edge workers are deployed to this environment.'
		);
	} );

	it( 'returns empty JSON data without friendly prose when there are no workers', async () => {
		api.listEdgeWorkers.mockResolvedValue( [] );

		const rows = await edgeWorkersListCommand( [], { ...opts, format: 'json' } );

		expect( rows ).toEqual( [] );
		expect( console.log ).not.toHaveBeenCalled();
	} );

	it( 'neutralizes terminal controls in remote table fields', async () => {
		api.listEdgeWorkers.mockResolvedValue( [
			{
				id: 5,
				name: 'headers\u001b[2J',
				active: true,
				phases: [ 'client_response\nforged' ],
				location: { operator: 'starts_with', value: '/api/\u001b[31m' },
				onFailure: 'continue\u0007',
				updatedAt: '2026-06-04\rforged',
			},
		] );

		const [ row ] = await edgeWorkersListCommand( [], opts );
		const output = Object.values( row ).join( '|' );

		// eslint-disable-next-line no-control-regex
		expect( output ).not.toMatch( /[\u0000-\u001f\u007f-\u009f]/ );
		expect( output ).toContain( String.raw`\u001b` );
		expect( output ).toContain( String.raw`\u000a` );
	} );

	it( 'leaves JSON row values intact for JSON.stringify to escape', async () => {
		api.listEdgeWorkers.mockResolvedValue( [
			{
				id: 5,
				name: 'headers\u001b[2J',
				active: false,
				phases: [],
				location: null,
				onFailure: 'continue',
				updatedAt: '2026-06-04',
			},
		] );

		const [ row ] = await edgeWorkersListCommand( [], { ...opts, format: 'json' } );

		expect( row.name ).toBe( 'headers\u001b[2J' );
		expect( JSON.stringify( [ row ] ) ).toContain( String.raw`\u001b` );
	} );

	it( 'reports a friendly error when the API call fails', async () => {
		api.listEdgeWorkers.mockRejectedValue( new Error( 'boom' ) );

		await expect( edgeWorkersListCommand( [], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );
		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to list edge workers: boom' );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_list_command_error',
			{ error: 'list_failed' }
		);
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_list_command_success',
			expect.anything()
		);
	} );
} );
