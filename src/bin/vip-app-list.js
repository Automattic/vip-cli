#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import API from 'lib/api';

command( { format: true } )
	.argv( process.argv, async ( arg, options ) => {
		const api = await API();

		let response;
		try {
			response = await api
				.query( {
					// $FlowFixMe: gql template is not supported by flow
					query: gql`query Apps( $first: Int, $after: String ) {
						apps( first: $first, after: $after ) {
							total,
							nextCursor
							edges {
								id,
								name,
								repo,
								environments {
									id
								}
							}
						}
					}`,
					variables: {
						first: 10,
						after: null, // TODO make dynamic
					},
				} );
		} catch ( err ) {
			console.log( 'Failed to fetch apps: %s', err.toString() );
			return;
		}

		if ( ! response ||
			! response.data ||
			! response.data.apps ||
			! response.data.apps.edges ||
			! response.data.apps.edges.length ) {
			console.log( 'No apps found' );
			return;
		}

		const apps = response.data.apps.edges;

		return apps.map( app => {
			const out = Object.assign( {}, app );
			out.environments = out.environments.length;
			return out;
		} );
	} );
