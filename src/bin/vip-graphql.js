#!/usr/bin/env node
// @flow

const gql = require( 'graphql-tag' );

// ours
const command = require( '../lib/cli/command' );
const API = require( '../lib/api' );

command( { requiredArgs: 1, format: true } )
	.argv( process.argv, async ( arg, opts ) => {
		const api = await API();

		let res;
		try {
			res = await api
				// $FlowFixMe
				.query( { query: gql`query Query ${ arg[ 0 ] }` } );
		} catch ( err ) {
			console.log( err.toString() );
			return;
		}

		const keys = Object.keys( res.data );
		if ( keys.length < 1 ) {
			console.log( 'Empty set' );
			return;
		}

		console.log( res.data[ keys[ 0 ] ] );
	} );
