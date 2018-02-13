#!/usr/bin/env node
// @flow
const gql = require( 'graphql-tag' );

// ours
const command = require( '../lib/cli/command' );
const API = require( '../lib/api' );

command( { format: true } )
	.argv( process.argv, async ( arg, options ) => {
		const api = await API();

		let apps;
		try {
			apps = await api
				.query( { query: gql`query Apps {apps(limit:10,page:1){id,name,repo,environments{id}}}` } );
		} catch ( err ) {
			console.log( err.toString() );
			return;
		}

		if ( ! apps || ! apps.data || ! apps.data.apps || ! apps.data.apps.length ) {
			console.log( 'No apps found' );
			return;
		}

		return apps.data.apps.map( app => {
			const out = Object.assign( {}, app );
			out.environments = out.environments.length;
			return out;
		} );
	} );
