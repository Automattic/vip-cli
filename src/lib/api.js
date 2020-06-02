// @flow

/**
 * External dependencies
 */
require( 'isomorphic-fetch' );
import { ApolloClient } from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { onError } from 'apollo-link-error';
import chalk from 'chalk';
import ProxyAgent from 'socks-proxy-agent';

/**
 * Internal dependencies
 */
import Token from './token';

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
	const headers = {};

	if ( token ) {
		headers.Authorization = `Bearer ${ token.raw }`;
	}

	const errorLink = onError( ( { networkError, graphQLErrors } ) => {
		if ( networkError && networkError.statusCode === 401 ) {
			console.error( chalk.red( 'Unauthorized:' ), 'You are unauthorized to perform this request, please logout with `vip logout` then try again.' );
			process.exit();
		}

		if ( graphQLErrors && graphQLErrors.length && globalGraphQLErrorHandlingEnabled ) {
			graphQLErrors.forEach( error => {
				console.error( chalk.red( 'Error:' ), error.message );
			} );

			process.exit();
		}
	} );

	const httpLink = new HttpLink( { uri: API_URL, headers: headers, fetchOptions: {
		agent: process.env.hasOwnProperty( 'VIP_PROXY' ) ? new ProxyAgent( process.env.VIP_PROXY ) : null,
	} } );

	return new ApolloClient( {
		link: errorLink.concat( httpLink ),
		cache: new InMemoryCache(),
	} );
}
