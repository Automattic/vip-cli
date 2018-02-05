// @flow
require( 'isomorphic-fetch' );
const FetchQL = require( 'fetchql' );

// ours
const Token = require( './token' );

// Config
const API_URL = process.env.API_URL || 'https://api.go-vip.co/graphql';

module.exports = async function API(): Promise<FetchQL> {
	const token = await Token.get();
	const headers = {};

	if ( token ) {
		headers.Authorization = `Bearer ${ token.raw }`;
	}

	return new FetchQL( { url: API_URL, headers: headers } );
};
