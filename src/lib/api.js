// @flow

/**
 * External dependencies
 */
require( 'isomorphic-fetch' );
import { ApolloClient } from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';

/**
 * Internal dependencies
 */
import Token from './token';

// Config
export const API_HOST = process.env.API_HOST || 'https://api.wpvip.com';
export const API_URL = `${ API_HOST }/graphql`;

export default async function API(): Promise<ApolloClient> {
	const token = await Token.get();
	const headers = {};

	if ( token ) {
		headers.Authorization = `Bearer ${ token.raw }`;
	}

	return new ApolloClient( {
		link: new HttpLink( { uri: API_URL, headers: headers } ),
		cache: new InMemoryCache(),
	} );
}
