import { edgeWorkersListCommand } from '../../src/bin/vip-edge-workers-list';
import * as api from '../../src/lib/api/edge-workers';
import * as exit from '../../src/lib/cli/exit';

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
	} );

	it( 'shows a friendly message and returns an empty array when there are none', async () => {
		api.listEdgeWorkers.mockResolvedValue( [] );

		const rows = await edgeWorkersListCommand( [], opts );

		expect( rows ).toEqual( [] );
		expect( console.log ).toHaveBeenCalledWith(
			'No edge workers are deployed to this environment.'
		);
	} );

	it( 'reports a friendly error when the API call fails', async () => {
		api.listEdgeWorkers.mockRejectedValue( new Error( 'boom' ) );

		await expect( edgeWorkersListCommand( [], opts ) ).rejects.toBe( 'EXIT_WITH_ERROR' );
		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to list edge workers: boom' );
	} );
} );
