require( 'isomorphic-fetch' );
const Token = require( './token' );

// Config
const API_URL = process.env.API_URL || 'https://api.go-vip.co/graphql';

module.exports = class API {
	constructor( token ) {
		if ( token ) {
			this.token = token;
		}
	}

	async query( q, options = { headers: {} } ) {
		let token = this.token;

		if ( ! token ) {
			token = await Token.get();
			token = token.raw;
		}

		if ( token ) {
			options.headers.Authorization = `Bearer ${ token }`;
		}

		return fetch( API_URL + '?query=' + q, options );
	}
};
