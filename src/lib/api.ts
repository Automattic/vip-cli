import {
	ApolloClient,
	HttpLink,
	InMemoryCache,
	type NormalizedCacheObject,
	type Operation,
} from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { ApolloLink } from '@apollo/client/link/core';
import { ErrorResponse, onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { ServerError } from '@apollo/client/link/utils';
import chalk from 'chalk';
import debugLib from 'debug';
import { FetchError } from 'node-fetch';

import http from './api/http';
import env from './env';
import Token from './token';
import { createProxyAgent } from '../lib/http/proxy-agent';

// Config
export const PRODUCTION_API_HOST = 'https://api.wpvip.com';
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
export const API_HOST = process.env.API_HOST || PRODUCTION_API_HOST; // NOSONAR
export const API_URL = `${ API_HOST }/graphql`;

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
	operation: Operation,
	error: unknown
): boolean {
	const debugSuffix = `Operation: ${ operation.operationName }. Attempt: ${ attempt }.`;

	if (
		! error ||
		operation.query.definitions.some(
			def => def.kind === 'OperationDefinition' && def.operation !== 'query'
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

function isServerError(
	networkError: ErrorResponse[ 'networkError' ]
): networkError is ServerError {
	if ( ! networkError ) {
		return false;
	}
	return 'result' in networkError;
}

export default function API( {
	exitOnError = true,
	silenceAuthErrors = false,
	customRetryLink,
}: {
	exitOnError?: boolean;
	silenceAuthErrors?: boolean;
	customRetryLink?: RetryLink;
} = {} ): ApolloClient< NormalizedCacheObject > {
	const errorLink = onError( ( { networkError, graphQLErrors } ) => {
		if (
			! silenceAuthErrors &&
			networkError &&
			'statusCode' in networkError &&
			networkError.statusCode === 401
		) {
			let message =
				'You are not authorized to perform this request; please logout with `vip logout`, then try again.';
			if (
				isServerError( networkError ) &&
				networkError.result?.code === 'token-disabled-inactivity'
			) {
				message =
					'Your token has expired due to inactivity; please log out with `vip logout`, then try again.';
			}
			console.error( chalk.red( 'Unauthorized:' ), message );
			process.exit( 1 );
		}

		if ( graphQLErrors?.length && globalGraphQLErrorHandlingEnabled ) {
			graphQLErrors.forEach( error => {
				console.error( chalk.red( 'Error:' ), error.message );
			} );

			if ( exitOnError ) {
				process.exit( 1 );
			}
		}
	} );

	const withToken = setContext( async (): Promise< { token: string } > => {
		const token = ( await Token.get() ).raw;

		return { token };
	} );

	const authLink = new ApolloLink( ( operation, forward ) => {
		const ctx = operation.getContext();

		const headers = {
			'User-Agent': env.userAgent,
			Authorization: `Bearer ${ ctx.token }`,
			...ctx.headers,
		} as Record< string, string >;

		operation.setContext( { headers } );

		return forward( operation );
	} );

	const proxyAgent = createProxyAgent( API_URL );

	const httpLink = new HttpLink( {
		uri: operation => {
			// to make it easier to write tests, we'll skip adding x_query for tests
			if ( process.env.NODE_ENV === 'test' ) {
				return API_URL;
			}
			return `${ API_URL }?x_query=${ decodeURIComponent( operation.operationName ) }`;
		},
		fetch: http,
		fetchOptions: {
			agent: proxyAgent,
		},
	} );

	const retryLink = new RetryLink( {
		delay: {
			initial: RETRY_LINK_INITIAL_DELAY_MS,
			max: RETRY_LINK_MAX_DELAY_MS,
		},
		attempts: shouldRetryRequest,
	} );

	return new ApolloClient< NormalizedCacheObject >( {
		link: ApolloLink.from( [
			withToken,
			errorLink,
			customRetryLink ? customRetryLink : retryLink,
			authLink,
			httpLink,
		] ),
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
