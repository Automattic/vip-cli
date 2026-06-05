import { appDeployTokenGenerateCmd } from '../../src/bin/vip-app-deploy-token-generate';
import API from '../../src/lib/api';
import * as exit from '../../src/lib/cli/exit';
import { makeCommandTracker } from '../../src/lib/tracker';

const mutate = jest.fn();
const tracker = jest.fn();

jest.mock( '../../src/lib/api', () => jest.fn() );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/tracker', () => ( {
	makeCommandTracker: jest.fn(),
} ) );

describe( 'vip-app-deploy-token-generate', () => {
	beforeEach( () => {
		mutate.mockReset();
		tracker.mockReset();
		API.mockReturnValue( { mutate } );
		makeCommandTracker.mockReturnValue( tracker );
		jest.spyOn( exit, 'withError' ).mockImplementation( () => {} );
	} );

	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it( 'returns the generated token payload as a single formatted row', async () => {
		mutate.mockResolvedValue( {
			data: {
				generateCustomDeployAccess: {
					token: 'secret-token',
					expiresAt: '2027-06-05T00:00:00.000Z',
				},
			},
		} );

		const result = await appDeployTokenGenerateCmd( [], {
			app: { id: 101, name: 'example-app' },
			env: { id: 202, uniqueLabel: 'develop', type: 'develop' },
		} );

		expect( mutate ).toHaveBeenCalledWith(
			expect.objectContaining( {
				variables: {
					input: {
						environmentIds: [ 202 ],
					},
				},
			} )
		);
		expect( result ).toEqual( [
			{
				appId: 101,
				appName: 'example-app',
				envId: 202,
				env: 'develop',
				token: 'secret-token',
				expiresAt: '2027-06-05T00:00:00.000Z',
			},
		] );
		expect( tracker ).toHaveBeenCalledTimes( 2 );
		expect( tracker ).toHaveBeenNthCalledWith( 1, 'execute' );
		expect( tracker ).toHaveBeenNthCalledWith( 2, 'success' );

		const trackerPayload = JSON.stringify( tracker.mock.calls );
		expect( trackerPayload ).not.toContain( 'token' );
		expect( trackerPayload ).not.toContain( 'secret-token' );
		expect( trackerPayload ).not.toContain( 'expiresAt' );
		expect( trackerPayload ).not.toContain( '2027-06-05T00:00:00.000Z' );
		expect( trackerPayload ).not.toContain( 'generateCustomDeployAccess' );
	} );

	it( 'surfaces API errors through exit.withError', async () => {
		mutate.mockRejectedValue( new Error( 'Forbidden' ) );

		await appDeployTokenGenerateCmd( [], {
			app: { id: 101, name: 'example-app' },
			env: { id: 202, uniqueLabel: 'develop', type: 'develop' },
		} );

		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to generate deploy token: Forbidden' );
		expect( tracker ).toHaveBeenNthCalledWith( 1, 'execute' );
		expect( tracker ).toHaveBeenNthCalledWith( 2, 'error', { error: 'Forbidden' } );
	} );

	it( 'fails when the API returns an empty payload', async () => {
		mutate.mockResolvedValue( {
			data: {
				generateCustomDeployAccess: null,
			},
		} );

		await appDeployTokenGenerateCmd( [], {
			app: { id: 101, name: 'example-app' },
			env: { id: 202, uniqueLabel: 'develop', type: 'develop' },
		} );

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to generate deploy token: API returned an empty response.'
		);
		expect( tracker ).toHaveBeenNthCalledWith( 2, 'error', {
			error: 'Missing generateCustomDeployAccess payload',
		} );
	} );
} );
