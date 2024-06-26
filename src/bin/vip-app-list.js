#!/usr/bin/env node

import gql from 'graphql-tag';

import API from '../lib/api';
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip app list';

command( { format: true, usage: baseUsage } )
	.examples( [
		{
			usage:
				baseUsage +
				'\n' +
				'    - ┌──────┬─────────────────┬─────────────────────────────────┐\n' +
				'    - │ id   │ name            │ repo                            │\n' +
				'    - ┌──────┬─────────────────┬─────────────────────────────────┐\n' +
				'    - │ 8886 │ example-app     │ wpcomvip/my-org-example-app     │\n' +
				'    - ┌──────┬─────────────────┬─────────────────────────────────┐\n' +
				'    - │ 4325 │ mytestmultisite │ wpcomvip/my-org-mytestmultisite │\n' +
				'    - └──────┴─────────────────┴─────────────────────────────────┘\n',
			description:
				'Retrieve a list of applications that can be accessed by the current authenticated VIP-CLI user.',
		},
	] )
	.argv( process.argv, async () => {
		const api = API();

		await trackEvent( 'app_list_command_execute' );

		let response;
		try {
			response = await api.query( {
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
