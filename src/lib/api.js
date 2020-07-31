/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import fetch from 'isomorphic-fetch';
import { ApolloClient } from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { onError } from 'apollo-link-error';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import Token from './token';
import env from './env';
import createSocksProxyAgent from 'lib/http/socks-proxy-agent';

// Config
export const PRODUCTION_API_HOST = 'https://api.wpvip.com';
export const API_HOST = process.env.API_HOST || PRODUCTION_API_HOST;
export const API_URL = `${ API_HOST }/graphql`;

let globalGraphQLErrorHandlingEnabled = true;

export function disableGlobalGraphQLErrorHandling() {
	globalGraphQLErrorHandlingEnabled = false;
}

export default async function API(): Promise<ApolloClient> {
	const token = await Token.get();
	const headers = {
		Authorization: token ? `Bearer ${ token.raw }` : null,
		'User-Agent': env.userAgent,
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

			process.exit();
		}
	} );

	const proxyAgent = createSocksProxyAgent();

	const httpLink = new HttpLink( {
		uri: API_URL,
		headers,
		fetchOptions: {
			agent: proxyAgent,
		},
	} );

	const apiClient = new ApolloClient( {
		link: errorLink.concat( httpLink ),
		cache: new InMemoryCache(),
	} );

	/**
	 * Call the Public API with an arbitrary path (e.g. to connect to REST endpoints).
	 * This will include the token in an Authorization header so requests are "logged-in."
	 * @param {string} path API path to pass to `fetch` -- will be prefixed by the API_HOST
	 * @param {object} options options to pass to `fetch`
	 * @returns {Promise} Return value of the `fetch` call
	 */
	apiClient.apiFetch = ( path: string, options = {} ): Promise<any> =>
		fetch( `${ API_HOST }${ path }`, {
			...options,
			...{
				agent: proxyAgent,
				headers: {
					...headers,
					...{
						'Content-Type': 'application/json',
					},
					...options.headers,
				},
			},
			...{
				body: typeof options.body === 'object' ? JSON.stringify( options.body ) : options.body,
			},
		} );

	return apiClient;
}
