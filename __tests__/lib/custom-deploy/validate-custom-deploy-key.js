import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpResponse = body =>
	Promise.resolve( {
		ok: true,
		status: 200,
		headers: {
			get: name => ( name.toLowerCase() === 'content-type' ? 'application/json' : null ),
		},
		json: () => Promise.resolve( body ),
		text: () => Promise.resolve( JSON.stringify( body ) ),
	} );

const REJECTED = {
	data: { validateCustomDeployAccess: null },
	errors: [
		{
			message: 'You cannot perform this action in this session',
			extensions: { code: 'access-denied' },
		},
	],
};

describe( 'validateCustomDeployKey', () => {
	let validateCustomDeployKey;
	let http;
	let exitWithError;
	let consoleError;

	beforeEach( () => {
		jest.resetModules();
		// Read at module load by custom-deploy.ts.
		process.env.WPVIP_DEPLOY_TOKEN = 'deploy-token';

		jest.doMock( '../../../src/lib/api/http', () => ( { __esModule: true, default: jest.fn() } ) );
		jest.doMock( '../../../src/lib/rechallenge/token-cache', () => ( {
			__esModule: true,
			default: {
				get: jest.fn( () => Promise.resolve( null ) ),
				set: jest.fn( () => Promise.resolve() ),
				clearScope: jest.fn(),
				clearAll: jest.fn(),
			},
		} ) );

		const exitModule = require( '../../../src/lib/cli/exit' );
		exitWithError = jest.spyOn( exitModule, 'withError' ).mockImplementation( message => {
			throw new Error( message );
		} );
		consoleError = jest.spyOn( console, 'error' ).mockImplementation( () => {} );
		jest.spyOn( process, 'exit' ).mockImplementation( () => {} );

		http = require( '../../../src/lib/api/http' ).default;
		( { validateCustomDeployKey } = require( '../../../src/lib/custom-deploy/custom-deploy' ) );
	} );

	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it( 'prints the API message for a rejected environment', async () => {
		http.mockReturnValueOnce( httpResponse( REJECTED ) );

		await expect( validateCustomDeployKey( 'mehmood-testing2', 'develop' ) ).rejects.toThrow(
			/^You cannot perform this action in this session$/
		);
		// Printed once, by this command, not also by the global GraphQL handler.
		expect( exitWithError ).toHaveBeenCalledTimes( 1 );
		expect( consoleError ).not.toHaveBeenCalled();
	} );

	it( 'keeps the message of errors other than an access denial', async () => {
		http.mockReturnValueOnce(
			httpResponse( {
				data: { validateCustomDeployAccess: null },
				errors: [
					{
						message: 'Custom deployments are not supported for this environment',
						extensions: { code: 'unsupported-operation' },
					},
				],
			} )
		);

		await expect( validateCustomDeployKey( 'my-app', 'develop' ) ).rejects.toThrow(
			/^Custom deployments are not supported for this environment$/
		);
	} );

	it( 'falls back to the invalid-key message for an empty response', async () => {
		http.mockReturnValueOnce( httpResponse( { data: { validateCustomDeployAccess: null } } ) );

		await expect( validateCustomDeployKey( 'my-app', 'develop' ) ).rejects.toThrow(
			'Unauthorized: Invalid or non-existent custom deploy key for environment.'
		);
	} );

	it( 'restores global GraphQL error handling afterwards', async () => {
		http.mockReturnValueOnce( httpResponse( REJECTED ) );
		await expect( validateCustomDeployKey( 'my-app', 'develop' ) ).rejects.toThrow();

		const API = require( '../../../src/lib/api' ).default;
		consoleError.mockClear();
		http.mockReturnValueOnce( httpResponse( { data: null, errors: REJECTED.errors } ) );
		await expect(
			API().query( {
				query: require( 'graphql-tag' ).default`
					query Other {
						me {
							id
						}
					}
				`,
			} )
		).rejects.toThrow();
		// The global handler is active again: it prints the server's message.
		expect( consoleError ).toHaveBeenCalledWith(
			expect.anything(),
			'You cannot perform this action in this session'
		);
	} );

	it( 'returns the environment data on success', async () => {
		const info = {
			success: true,
			appId: 1,
			envId: 2,
			envType: 'develop',
			envUniqueLabel: 'develop',
			primaryDomainName: 'example.com',
			launched: false,
		};
		http.mockReturnValueOnce(
			httpResponse( {
				data: { validateCustomDeployAccess: { __typename: 'CustomDeployInfo', ...info } },
			} )
		);

		await expect( validateCustomDeployKey( 'my-app', 'develop' ) ).resolves.toMatchObject( info );
		expect( exitWithError ).not.toHaveBeenCalled();
	} );
} );

describe( 'describeCustomDeployKeyError', () => {
	const { describeCustomDeployKeyError } = jest.requireActual(
		'../../../src/lib/custom-deploy/custom-deploy'
	);

	it( 'keeps the message of a network failure', () => {
		expect( describeCustomDeployKeyError( new Error( 'fetch failed' ) ) ).toBe( 'fetch failed' );
	} );
} );

describe( 'checkCustomDeployKey', () => {
	beforeEach( () => {
		jest.resetModules();
		process.env.WPVIP_DEPLOY_TOKEN = 'deploy-token';
		jest.doMock( '../../../src/lib/api/http', () => ( { __esModule: true, default: jest.fn() } ) );
		jest.doMock( '../../../src/lib/rechallenge/token-cache', () => ( {
			__esModule: true,
			default: {
				get: jest.fn( () => Promise.resolve( null ) ),
				set: jest.fn( () => Promise.resolve() ),
				clearScope: jest.fn(),
				clearAll: jest.fn(),
			},
		} ) );
	} );

	it( 'returns the rejection instead of exiting', async () => {
		const exitWithError = jest.spyOn( require( '../../../src/lib/cli/exit' ), 'withError' );
		const http = require( '../../../src/lib/api/http' ).default;
		const { checkCustomDeployKey } = require( '../../../src/lib/custom-deploy/custom-deploy' );
		http.mockReturnValueOnce( httpResponse( REJECTED ) );

		await expect( checkCustomDeployKey( 'my-app', 'develop' ) ).resolves.toEqual( {
			error: 'You cannot perform this action in this session',
		} );
		expect( exitWithError ).not.toHaveBeenCalled();
	} );
} );
