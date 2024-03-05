import {
	ApolloClient,
	HttpLink,
	InMemoryCache,
	type NormalizedCacheObject,
} from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { ApolloLink } from '@apollo/client/link/core';
import { onError } from '@apollo/client/link/error';
import chalk from 'chalk';

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

export function disableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = false;
}

export function enableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = true;
}

export default function API( {
	exitOnError = true,
	customAuthToken,
}: {
	exitOnError?: boolean;
	customAuthToken?: string;
} = {} ): ApolloClient< NormalizedCacheObject > {
	const errorLink = onError( ( { networkError, graphQLErrors } ) => {
		if ( networkError && 'statusCode' in networkError && networkError.statusCode === 401 ) {
			console.error(
				chalk.red( 'Unauthorized:' ),
				'You are unauthorized to perform this request, please logout with `vip logout` then try again.'
			);
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

	const withToken = setContext( async (): Promise< { token: Token | { raw: string } } > => {
		const token = customAuthToken ? { raw: customAuthToken } : await Token.get();

		return { token };
	} );

	const authLink = new ApolloLink( ( operation, forward ) => {
		const ctx = operation.getContext();
		const token = ctx.token as Token;

		operation.setContext( {
			headers: {
				'User-Agent': env.userAgent,
				Authorization: `Bearer ${ token.raw }`,
			},
		} );

		return forward( operation );
	} );

	const proxyAgent = createProxyAgent( API_URL );

	const httpLink = new HttpLink( {
		uri: API_URL,
		fetch: http,
		fetchOptions: {
			agent: proxyAgent,
		},
	} );

	return new ApolloClient< NormalizedCacheObject >( {
		link: ApolloLink.from( [ withToken, errorLink, authLink, httpLink ] ),
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
