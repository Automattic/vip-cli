// @flow
require( 'isomorphic-fetch' );
const { ApolloClient } = require( 'apollo-client' );
const { HttpLink } = require( 'apollo-link-http' );
const { InMemoryCache } = require( 'apollo-cache-inmemory' );

// ours
const Token = require( './token' );

// Config
const API_URL = process.env.API_URL || 'https://api.go-vip.co/graphql';

module.exports = async function API(): Promise<ApolloClient> {
	const token = await Token.get();
	const headers = {};

	if ( token ) {
		headers.Authorization = `Bearer ${ token.raw }`;
	}

	return new ApolloClient( {
		link: new HttpLink( { uri: API_URL, headers: headers } ),
		cache: new InMemoryCache(),
	} );
};
