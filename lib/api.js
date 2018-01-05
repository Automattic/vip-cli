require( 'isomorphic-fetch' );

// Config
const API_URL = process.env.API_URL || 'https://api.go-vip.co/graphql';

module.exports = class API {
	constructor( token ) {
		this.token = token;
	}

	query( q, options = { headers: {} } ) {
		options.headers.Authorization = `Bearer ${ this.token }`;
		return fetch( API_URL + '?query=' + q, options );
	}
};
