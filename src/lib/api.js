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

/**
 * Internal dependencies
 */
import Token from './token';

// Config
export const PRODUCTION_API_HOST = 'https://api.wpvip.com';
export const API_HOST = process.env.API_HOST || PRODUCTION_API_HOST;
export const API_URL = `${ API_HOST }/graphql`;

export default async function API(): Promise<ApolloClient> {
	const token = await Token.get();
	const headers = {};

	if ( token ) {
		headers.Authorization = `Bearer ${ token.raw }`;
	}

	const unauthorizedLink = onError( ( { networkError } ) => {
		if ( networkError && networkError.statusCode === 401 ) {
			console.error( chalk.red( 'Unauthorized:' ), 'You are unauthorized to perform this request, please logout with `vip logout` then try again.' );
			process.exit();
		}
	} );

	const httpLink = new HttpLink( { uri: API_URL, headers: headers } );

	return new ApolloClient( {
		link: unauthorizedLink.concat( httpLink ),
		cache: new InMemoryCache(),
	} );
}
