import { ApolloLink, Observable, type ApolloClient } from '@apollo/client/core';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import gql from 'graphql-tag';

import * as flowModule from '../../../src/lib/rechallenge/flow';
import createRechallengeLink from '../../../src/lib/rechallenge/link';
import tokenCache from '../../../src/lib/rechallenge/token-cache';

import type { RunRechallengeOptions } from '../../../src/lib/rechallenge/flow';
import type { ElevatedToken } from '../../../src/lib/rechallenge/types';

jest.mock( '../../../src/lib/rechallenge/flow', () => ( {
	runRechallenge: jest.fn(),
	isInteractiveContext: () => false,
	shouldWaitForRechallenge: () => true,
} ) );
jest.mock( '../../../src/lib/rechallenge/token-cache', () => ( {
	__esModule: true,
	default: {
		get: jest.fn(),
		set: jest.fn( () => Promise.resolve() ),
		clearScope: jest.fn(),
		clearAll: jest.fn(),
	},
} ) );

const runRechallenge = flowModule.runRechallenge as jest.MockedFunction<
	( opts: RunRechallengeOptions ) => Promise< ElevatedToken >
>;
const tokenGet = tokenCache.get as jest.MockedFunction<
	( scope: string ) => Promise< ElevatedToken | null >
>;

const MUTATION = gql`
	mutation UpdateDefensiveModeStatus($input: AppEnvironmentDefensiveModeUpdateStatusInput) {
		updateDefensiveModeStatus(input: $input) {
			success
			message
		}
	}
`;

const QUERY = gql`
	query Foo {
		foo
	}
`;

const ELEVATED_TOKEN: ElevatedToken = {
	token: 'jwt.payload.sig',
	expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
	purpose: 'validate-elevated-permissions',
};

function elevatedRequiredResult(): ApolloLink.Result {
	return {
		data: null,
		errors: [
			{
				message: 'Elevated permission required',
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
	} as unknown as ApolloLink.Result;
}

function successResult(): ApolloLink.Result {
	return { data: { updateDefensiveModeStatus: { success: true, message: 'ok' } } };
}

function makeDownstream( responses: ApolloLink.Result[] ) {
	const calls: { headers: Record< string, string > }[] = [];
	const link = new ApolloLink( operation => {
		const ctx = operation.getContext() as { headers?: Record< string, string > };
		calls.push( { headers: { ...( ctx.headers ?? {} ) } } );
		const result = responses.shift();
		return new Observable< ApolloLink.Result >( observer => {
			if ( result ) {
				observer.next( result );
				observer.complete();
			} else {
				observer.error( new Error( 'no more queued responses' ) );
			}
		} );
	} );
	return { link, calls };
}

// Apollo v4 requires a `client` in the execute context; use a null stand-in for unit tests.
const EXEC_CTX = { client: null as unknown as ApolloClient };

function executeLink(
	link: ApolloLink,
	request: Parameters< typeof ApolloLink.execute >[ 1 ]
): Promise< ApolloLink.Result > {
	return new Promise< ApolloLink.Result >( ( resolve, reject ) => {
		ApolloLink.execute( link, request, EXEC_CTX ).subscribe( {
			next: resolve,
			error: reject,
		} );
	} );
}

function expectExecutionError(
	link: ApolloLink,
	request: Parameters< typeof ApolloLink.execute >[ 1 ]
): Promise< Error > {
	return new Promise< Error >( ( resolve, reject ) => {
		const timeout = setTimeout( () => {
			reject( new Error( 'expected operation error but execution hung' ) );
		}, 250 );

		ApolloLink.execute( link, request, EXEC_CTX ).subscribe( {
			next: result => {
				clearTimeout( timeout );
				reject(
					new Error( `expected operation error but got result: ${ JSON.stringify( result ) }` )
				);
			},
			error: err => {
				clearTimeout( timeout );
				resolve( err as Error );
			},
			complete: () => {
				clearTimeout( timeout );
				reject( new Error( 'expected operation error but stream completed' ) );
			},
		} );
	} );
}

function deferred< T >(): {
	promise: Promise< T >;
	resolve: ( value: T ) => void;
} {
	let resolve!: ( value: T ) => void;
	const promise = new Promise< T >( _resolve => {
		resolve = _resolve;
	} );

	return { promise, resolve };
}

beforeEach( () => {
	jest.clearAllMocks();
	tokenGet.mockResolvedValue( null );
} );

describe( 'rechallengeLink', () => {
	it( 'passes queries through untouched', async () => {
		const { link: downstream, calls } = makeDownstream( [ successResult() ] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );
		const result = await executeLink( link, { query: QUERY } );
		expect( result ).toEqual( successResult() );
		expect( calls ).toHaveLength( 1 );
		expect( calls[ 0 ].headers[ 'x-elevated-token' ] ).toBeUndefined();
		expect( runRechallenge ).not.toHaveBeenCalled();
	} );

	it( 'attaches cached elevated token pre-flight when available', async () => {
		tokenGet.mockResolvedValueOnce( ELEVATED_TOKEN );
		const { link: downstream, calls } = makeDownstream( [ successResult() ] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );
		await executeLink( link, { query: MUTATION } );
		expect( calls[ 0 ].headers[ 'x-elevated-token' ] ).toBe( ELEVATED_TOKEN.token );
		expect( runRechallenge ).not.toHaveBeenCalled();
	} );

	it( 'on elevated-permission-required runs flow and retries with header', async () => {
		runRechallenge.mockResolvedValueOnce( ELEVATED_TOKEN );
		const { link: downstream, calls } = makeDownstream( [
			elevatedRequiredResult(),
			successResult(),
		] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );
		const result = await executeLink( link, { query: MUTATION } );
		expect( result ).toEqual( successResult() );
		expect( calls ).toHaveLength( 2 );
		expect( calls[ 0 ].headers[ 'x-elevated-token' ] ).toBeUndefined();
		expect( calls[ 1 ].headers[ 'x-elevated-token' ] ).toBe( ELEVATED_TOKEN.token );
		expect( runRechallenge ).toHaveBeenCalledWith(
			expect.objectContaining( {
				requestedOperation: 'updateDefensiveModeStatus',
				wait: true,
			} )
		);
	} );

	it( 'propagates the original error when the flow fails', async () => {
		runRechallenge.mockRejectedValueOnce( new Error( 'flow boom' ) );
		const { link: downstream } = makeDownstream( [ elevatedRequiredResult() ] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );
		const result = await executeLink( link, { query: MUTATION } );
		expect( result.errors?.[ 0 ].extensions?.code ).toBe( 'elevated-permission-required' );
	} );

	it( 'aborts the in-flight rechallenge flow when the operation is unsubscribed', async () => {
		let capturedSignal: AbortSignal | undefined;
		runRechallenge.mockImplementationOnce( opts => {
			capturedSignal = opts.signal;
			// Never resolves: the flow is still polling when we tear down.
			return new Promise< ElevatedToken >( () => {} );
		} );
		const { link: downstream } = makeDownstream( [ elevatedRequiredResult() ] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );

		const subscription = ApolloLink.execute( link, { query: MUTATION }, EXEC_CTX ).subscribe( {
			next: () => {},
			error: () => {},
		} );

		// Let preflight + first forward + the rechallenge dispatch settle.
		await new Promise( resolve => setTimeout( resolve, 0 ) );
		expect( capturedSignal ).toBeDefined();
		expect( capturedSignal?.aborted ).toBe( false );

		subscription.unsubscribe();
		expect( capturedSignal?.aborted ).toBe( true );
	} );

	it( 'passes the second elevated-permission-required upstream without retrying again', async () => {
		runRechallenge.mockResolvedValueOnce( ELEVATED_TOKEN );
		const { link: downstream } = makeDownstream( [
			elevatedRequiredResult(),
			elevatedRequiredResult(),
		] );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );
		const result = await executeLink( link, { query: MUTATION } );
		expect( result.errors?.[ 0 ].extensions?.code ).toBe( 'elevated-permission-required' );
		expect( runRechallenge ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'propagates synchronous downstream setup errors on the initial request', async () => {
		const downstream = new ApolloLink( () => {
			throw new Error( 'initial downstream setup failed' );
		} );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );

		const err = await expectExecutionError( link, { query: MUTATION } );
		expect( err.message ).toContain( 'initial downstream setup failed' );
		expect( runRechallenge ).not.toHaveBeenCalled();
	} );

	it( 'propagates synchronous downstream setup errors on the retry request', async () => {
		runRechallenge.mockResolvedValueOnce( ELEVATED_TOKEN );

		let attempts = 0;
		const downstream = new ApolloLink( () => {
			attempts += 1;
			if ( attempts === 1 ) {
				return new Observable< ApolloLink.Result >( observer => {
					observer.next( elevatedRequiredResult() );
					observer.complete();
				} );
			}

			throw new Error( 'retry downstream setup failed' );
		} );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );

		const err = await expectExecutionError( link, { query: MUTATION } );
		expect( attempts ).toBe( 2 );
		expect( err.message ).toContain( 'retry downstream setup failed' );
	} );

	it( 'does not forward when unsubscribed before preflight resolves', async () => {
		const waitForToken = deferred< ElevatedToken | null >();
		tokenGet.mockImplementationOnce( () => waitForToken.promise );

		const downstreamSpy = jest.fn(
			() =>
				new Observable< ApolloLink.Result >( observer => {
					observer.next( successResult() );
					observer.complete();
				} )
		);
		const downstream = new ApolloLink( downstreamSpy );
		const link = ApolloLink.from( [ createRechallengeLink(), downstream ] );

		const subscription = ApolloLink.execute( link, { query: MUTATION }, EXEC_CTX ).subscribe( {
			next: () => {},
			error: () => {},
		} );

		subscription.unsubscribe();
		waitForToken.resolve( null );
		await new Promise( resolve => setTimeout( resolve, 0 ) );

		expect( downstreamSpy ).not.toHaveBeenCalled();
	} );
} );
