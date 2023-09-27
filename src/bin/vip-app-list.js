#!/usr/bin/env node

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import API from '../lib/api';
import { trackEvent } from '../lib/tracker';

command( { format: true } ).argv( process.argv, async () => {
	const api = await API();

	await trackEvent( 'app_list_command_execute' );

	let response;
	try {
		response = await api.query( {
			// $FlowFixMe: gql template is not supported by flow
			query: gql`
				query Apps($first: Int, $after: String) {
					apps(first: $first, after: $after) {
						total
						nextCursor
						edges {
							id
							name
							repo
						}
					}
				}
			`,
			variables: {
				first: 100,
				after: null, // TODO make dynamic
			},
		} );
	} catch ( err ) {
		const message = err.toString();

		await trackEvent( 'app_list_command_fetch_error', {
			error: message,
		} );

		console.log( 'Failed to fetch apps: %s', message );
		return;
	}

	if (
		! response ||
		! response.data ||
		! response.data.apps ||
		! response.data.apps.edges ||
		! response.data.apps.edges.length
	) {
		const message = 'No apps found';

		await trackEvent( 'app_list_command_fetch_error', {
			error: message,
		} );

		console.log( message );
		return;
	}

	await trackEvent( 'app_list_command_success' );

	return response.data.apps.edges;
} );
