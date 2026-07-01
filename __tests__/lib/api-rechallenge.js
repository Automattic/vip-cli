import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import gql from 'graphql-tag';

let API;
let http;
let runRechallenge;

const MUTATION = gql`
	mutation UpdateDefensiveModeStatus($input: AppEnvironmentDefensiveModeUpdateStatusInput) {
		updateDefensiveModeStatus(input: $input) {
			success
			message
		}
	}
`;

const httpResponse = ( status, body ) => {
	return Promise.resolve( {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get: name => ( name.toLowerCase() === 'content-type' ? 'application/json' : null ),
		},
		json: () => Promise.resolve( body ),
		text: () => Promise.resolve( JSON.stringify( body ) ),
	} );
};

describe( 'API rechallenge integration', () => {
	beforeEach( () => {
		jest.resetModules();
		jest.doMock( '../../src/lib/api/http', () => ( {
			__esModule: true,
			default: jest.fn(),
		} ) );
		jest.doMock( '../../src/lib/rechallenge/flow', () => ( {
			runRechallenge: jest.fn(),
			isInteractiveContext: () => false,
			shouldWaitForRechallenge: () => true,
		} ) );
		jest.doMock( '../../src/lib/rechallenge/token-cache', () => ( {
			__esModule: true,
			default: {
				get: jest.fn( () => Promise.resolve( null ) ),
				set: jest.fn( () => Promise.resolve() ),
				clearScope: jest.fn(),
				clearAll: jest.fn(),
			},
		} ) );

		API = require( '../../src/lib/api' ).default;
		http = require( '../../src/lib/api/http' ).default;
		runRechallenge = require( '../../src/lib/rechallenge/flow' ).runRechallenge;

		process.env.NODE_ENV = 'test';
		http.mockReset();
		runRechallenge.mockReset();
	} );

	it( 'retries a mutation through API chain with elevated header after rechallenge', async () => {
		runRechallenge.mockResolvedValueOnce( {
			token: 'manual-elevated-token',
			expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
			purpose: 'validate-elevated-permissions',
		} );

		http
			.mockReturnValueOnce(
				httpResponse( 200, {
					data: null,
					errors: [
						{
							message: 'Missing elevated token',
							extensions: {
								code: 'elevated-permission-required',
								rechallenge: {
									version: 'v2',
									createSessionPath: '/rechallenge/v2/sessions',
									statusPathTemplate: '/rechallenge/v2/sessions/{challengeId}',
									exchangePathTemplate: '/rechallenge/v2/sessions/{challengeId}/exchange',
									elevatedHeaderName: 'x-elevated-token',
								},
							},
						},
					],
				} )
			)
			.mockReturnValueOnce(
				httpResponse( 200, {
					data: {
						updateDefensiveModeStatus: {
							success: true,
							message: 'ok',
						},
					},
				} )
			);

		const api = API( { exitOnError: false } );
		const result = await api.mutate( {
			mutation: MUTATION,
			variables: {
				input: {
					id: 123,
					environmentId: 456,
					enabled: true,
				},
			},
		} );

		expect( runRechallenge ).toHaveBeenCalledTimes( 1 );
		expect( http ).toHaveBeenCalledTimes( 2 );
		const secondCallInit = http.mock.calls[ 1 ][ 1 ];
		expect( secondCallInit.headers[ 'x-elevated-token' ] ).toBe( 'manual-elevated-token' );
		expect( result.data.updateDefensiveModeStatus.success ).toBe( true );
	} );
} );
