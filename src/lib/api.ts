import {
	ApolloClient,
	HttpLink,
	InMemoryCache,
	ServerError,
	CombinedGraphQLErrors,
	ApolloLink,
} from '@apollo/client/core';
import { ErrorLink } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import chalk from 'chalk';
import debugLib from 'debug';
import { Kind, OperationTypeNode } from 'graphql';
import { FetchError } from 'node-fetch';

import { API_URL } from './api/constants';
import http from './api/http';

// Config — re-exported from ./api/constants so modules in the rechallenge tree
// can import them without pulling in the full api.ts graph (which would create
// a circular dependency via the rechallenge link).
export { API_HOST, API_URL, PRODUCTION_API_HOST } from './api/constants';

let globalGraphQLErrorHandlingEnabled = true;

const RETRY_LINK_MAX_ATTEMPTS = 5;
const RETRY_LINK_INITIAL_DELAY_MS = 1000; // 1 second
const RETRY_LINK_MAX_DELAY_MS = 5000; // 5 seconds

const debug = debugLib( '@automattic/vip:http:graphql' );

export function disableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = false;
}

export function enableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = true;
}

export function shouldRetryRequest(
	attempt: number,
	operation: ApolloLink.Operation,
	error: unknown
): boolean {
	const debugSuffix = `Operation: ${ operation.operationName }. Attempt: ${ attempt }.`;

	if (
		! error ||
		operation.query.definitions.some(
			def => def.kind === Kind.OPERATION_DEFINITION && def.operation !== OperationTypeNode.QUERY
		)
	) {
		debug( `Request failed. ${ debugSuffix }` );

		return false;
	}

	if ( attempt > RETRY_LINK_MAX_ATTEMPTS ) {
		debug( `Request failed and max retry attempts reached. ${ debugSuffix }`, error );

		return false;
	}

	if ( error instanceof FetchError && error.code === 'ECONNREFUSED' ) {
		debug( `Request failed. Retrying request due to connection refused error. ${ debugSuffix }` );

		return true;
	}

	const statusCode: number | undefined = ( error as ServerError )?.statusCode;

	if ( statusCode && statusCode !== 429 && statusCode < 500 ) {
		debug( `Request failed. Status code: ${ statusCode }. ${ debugSuffix }`, error );

		return false;
	}

	debug( `Request failed. Retrying request due to server error. ${ debugSuffix }`, error );

	return true;
}

export default function API( {
	exitOnError = true,
	silenceAuthErrors = false,
	customRetryLink,
}: {
	exitOnError?: boolean;
	silenceAuthErrors?: boolean;
	customRetryLink?: RetryLink;
} = {} ): ApolloClient {
	const errorLink = new ErrorLink( ( { error } ) => {
		if ( ! silenceAuthErrors && error instanceof ServerError && error.statusCode === 401 ) {
			let message;
			try {
				const result = JSON.parse( error.bodyText ) as unknown;
				if (
					typeof result === 'object' &&
					result !== null &&
					'code' in result &&
					result?.code === 'token-disabled-inactivity'
				) {
					message = 'Your token has expired due to inactivity';
				}
			} catch {
				// If we can't parse the body, use the default message
				message = 'You are not authorized to perform this request';
			}

			message += '; please log out with `vip logout`, then try again.';
			console.error( chalk.red( 'Unauthorized:' ), message );
			process.exit( 1 );
		}

		if ( CombinedGraphQLErrors.is( error ) && globalGraphQLErrorHandlingEnabled ) {
			for ( const err of error.errors ) {
				console.error( chalk.red( 'Error:' ), err.message );
			}

			if ( exitOnError ) {
				process.exit( 1 );
			}
		}
	} );

	const httpLink = new HttpLink( {
		uri: operation => {
			// to make it easier to write tests, we'll skip adding x_query for tests
			if ( process.env.NODE_ENV === 'test' ) {
				return API_URL;
			}
			const operationName = operation.operationName ?? '';
			return `${ API_URL }?x_query=${ encodeURIComponent( operationName ) }`;
		},
		fetch: http as unknown as typeof globalThis.fetch,
	} );

	const retryLink =
		customRetryLink ??
		new RetryLink( {
			delay: {
				initial: RETRY_LINK_INITIAL_DELAY_MS,
				max: RETRY_LINK_MAX_DELAY_MS,
			},
			attempts: shouldRetryRequest,
		} );

	// Lazy-require the rechallenge link to avoid a circular-dependency issue in
	// Jest tests.  Importing at module top-level would cause rechallenge/client.ts
	// to be loaded during jest.setupMocks.js (via apiConfig → feature-flags →
	// api.ts → link.ts → client.ts), preventing jest.mock('../api/http') from
	// intercepting the http reference captured inside client.ts.  A require()
	// call inside the function body is resolved after all mocks are registered.

	type RechallengeLinkModule = typeof import('./rechallenge/link');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const linkMod = require( './rechallenge/link' ) as RechallengeLinkModule;
	const createRechallengeLink = linkMod.default;

	return new ApolloClient( {
		link: ApolloLink.from( [ errorLink, createRechallengeLink(), retryLink, httpLink ] ),
		cache: new InMemoryCache( {
			typePolicies: {
				WPSite: {
					// By default the cache key is assumed to be `id` which is not globally unique.
					// So we are using `id` + `homeUrl` to prevent clashing keys.
					// Change this to `blogId` + `homeUrl` when we switch to using wpSitesSDS
					keyFields: [ 'id', 'homeUrl' ],
				},
			},
		} ),
	} );
}
