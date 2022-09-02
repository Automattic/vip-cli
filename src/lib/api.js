/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fetch from 'node-fetch';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core';
import { ApolloLink } from '@apollo/client/link/core';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import Token from './token';
import env from './env';
import { createProxyAgent } from 'lib/http/proxy-agent';

// Config
export const PRODUCTION_API_HOST = 'https://api.wpvip.com';
export const API_HOST = process.env.API_HOST || PRODUCTION_API_HOST;
export const API_URL = `${ API_HOST }/graphql`;

let globalGraphQLErrorHandlingEnabled = true;

export function disableGlobalGraphQLErrorHandling() {
	globalGraphQLErrorHandlingEnabled = false;
}

export default async function API( { exitOnError = true } = {} ): Promise<ApolloClient> {
	const authToken = await Token.get();
	const headers = {
		'User-Agent': env.userAgent,
		Authorization: authToken ? `Bearer ${ authToken.raw }` : null,
	};

	const errorLink = onError( ( { networkError, graphQLErrors } ) => {
		if ( networkError && networkError.statusCode === 401 ) {
			console.error(
				chalk.red( 'Unauthorized:' ),
				'You are unauthorized to perform this request, please logout with `vip logout` then try again.'
			);
			process.exit();
		}

		if ( graphQLErrors && graphQLErrors.length && globalGraphQLErrorHandlingEnabled ) {
			graphQLErrors.forEach( error => {
				console.error( chalk.red( 'Error:' ), error.message );
			} );

			if ( exitOnError ) {
				process.exit();
			}
		}
	} );

	const withToken = setContext( async () =>{
		const token = await Token.get();

		return { token };
	} );

	const authLink = new ApolloLink( ( operation, forward ) => {
		const { token } = operation.getContext();

		operation.setContext( {
			headers: {
				Authorization: token ? `Bearer ${ token.raw }` : null,
			},
		} );

		return forward( operation );
	} );

	const proxyAgent = createProxyAgent( API_URL );

	const http = require('./api/http').default;

	const httpLink = new HttpLink( {
		uri: API_URL,
		headers,
		fetch: http,
		fetchOptions: {
			agent: proxyAgent,
		},
	} );

	const apiClient = new ApolloClient( {
		link: ApolloLink.from( [ withToken, errorLink, authLink, httpLink ] ),
		cache: new InMemoryCache(),
	} );

	return apiClient;
}
