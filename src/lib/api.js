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
const API_URL = process.env.API_URL || 'https://api.go-vip.co/graphql';

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
