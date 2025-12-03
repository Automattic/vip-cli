/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-return */

import { ApolloClient, ApolloLink, ServerError } from '@apollo/client/core';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OperationTypeNode } from 'graphql';
import gql from 'graphql-tag';
import { FetchError } from 'node-fetch';

import { shouldRetryRequest } from '../../src/lib/api';

// Mock dependencies
jest.mock( '../../src/lib/token', () => ( {
	__esModule: true,
	default: {
		get: jest.fn( () => Promise.resolve( { raw: 'mock-token' } ) ),
	},
} ) );

jest.mock( '../../src/lib/api/http', () => ( {
	__esModule: true,
	default: jest.fn(),
} ) );

jest.mock( '../../src/lib/http/proxy-agent', () => ( {
	createProxyAgent: jest.fn( () => null ),
} ) );

const dummyMutation = gql`
	mutation UpdateData {
		updateData(input: { id: "1", value: "newValue" }) {
			success
		}
	}
`;

const dummyQuery = gql`
	query Hello {
		world
	}
`;

const mockOperation = {
	operationName: 'TestQuery',
	operationType: OperationTypeNode.QUERY,
	query: dummyQuery,
	variables: {},
	extensions: [],
	setContext: jest.fn(),
	getContext: jest.fn(),
	client: undefined as unknown as ApolloClient,
} as ApolloLink.Operation;

describe( 'API Retry Logic', () => {
	beforeEach( () => {
		// Reset environment
		process.env.NODE_ENV = 'test';

		// Create a mock operation
	} );

	afterEach( () => {
		jest.clearAllMocks();
	} );

	describe( 'shouldRetryRequest', () => {
		it( 'should not retry when error is null or undefined', () => {
			const result = shouldRetryRequest( 1, mockOperation, null );
			expect( result ).toBe( false );
		} );

		it( 'should not retry mutations', () => {
			const mutationOperation = {
				...mockOperation,
				query: dummyMutation,
			};

			const error = new Error( 'Server error' );
			const result = shouldRetryRequest( 1, mutationOperation, error );

			expect( result ).toBe( false );
		} );

		it( 'should not retry after max attempts reached', () => {
			const error = { statusCode: 500 } as ServerError;
			const result = shouldRetryRequest( 6, mockOperation, error );

			expect( result ).toBe( false );
		} );

		it( 'should retry on ECONNREFUSED errors', () => {
			const error = Object.assign( new Error( 'Connection refused' ), {
				code: 'ECONNREFUSED',
			} ) as FetchError;

			const result = shouldRetryRequest( 1, mockOperation, error );

			expect( result ).toBe( true );
		} );

		it.each( [
			[ 500, 'server errors' ],
			[ 502, 'bad gateway errors' ],
			[ 503, 'service unavailable errors' ],
			[ 504, 'gateway timeout errors' ],
			[ 429, 'rate limit errors' ],
		] )( 'should retry on %i %s', ( statusCode: number ) => {
			const error = { statusCode } as ServerError;
			const result = shouldRetryRequest( 1, mockOperation, error );

			expect( result ).toBe( true );
		} );

		it.each( [
			[ 400, 'bad request' ],
			[ 401, 'unauthorized' ],
			[ 403, 'forbidden' ],
			[ 404, 'not found' ],
		] )( 'should not retry on %i %s errors', ( statusCode: number ) => {
			const error = { statusCode } as ServerError;
			const result = shouldRetryRequest( 1, mockOperation, error );

			expect( result ).toBe( false );
		} );

		it( 'should retry exactly 5 times before giving up', () => {
			const error = { statusCode: 500 } as ServerError;

			expect( shouldRetryRequest( 1, mockOperation, error ) ).toBe( true );
			expect( shouldRetryRequest( 2, mockOperation, error ) ).toBe( true );
			expect( shouldRetryRequest( 3, mockOperation, error ) ).toBe( true );
			expect( shouldRetryRequest( 4, mockOperation, error ) ).toBe( true );
			expect( shouldRetryRequest( 5, mockOperation, error ) ).toBe( true );

			expect( shouldRetryRequest( 6, mockOperation, error ) ).toBe( false );
		} );

		it( 'should retry on server errors without explicit status code', () => {
			const error = new Error( 'Server error' );
			const result = shouldRetryRequest( 1, mockOperation, error );

			expect( result ).toBe( true );
		} );
	} );

	describe( 'Operation Types', () => {
		it( 'should handle query operations correctly', () => {
			const error = { statusCode: 500 } as ServerError;
			const result = shouldRetryRequest( 1, mockOperation, error );

			expect( result ).toBe( true );
		} );
	} );

	describe( 'Edge Cases', () => {
		it( 'should handle FetchError without ECONNREFUSED code', () => {
			const error = Object.assign( new Error( 'Network error' ), {
				code: 'ENOTFOUND',
			} ) as FetchError;

			const result = shouldRetryRequest( 1, mockOperation, error );

			// Should retry as it's a general error
			expect( result ).toBe( true );
		} );

		it( 'should handle error with statusCode 0', () => {
			const error = { statusCode: 0 } as ServerError;
			const result = shouldRetryRequest( 1, mockOperation, error );

			// statusCode 0 is falsy, so it's treated as undefined and should retry
			expect( result ).toBe( true );
		} );

		it( 'should handle error with undefined statusCode', () => {
			const error = new Error( 'Unknown error' );
			const result = shouldRetryRequest( 1, mockOperation, error );

			// Should retry when statusCode is undefined
			expect( result ).toBe( true );
		} );
	} );
} );
