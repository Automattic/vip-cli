#!/usr/bin/env node

import gql from 'graphql-tag';

import API, { disableGlobalGraphQLErrorHandling } from '../lib/api';
import command from '../lib/cli/command';

import type {
	AppByIdQuery,
	AppByIdQueryVariables,
	AppByNameQuery,
	AppByNameQueryVariables,
} from './vip-internal-fetch-integrations.generated';

interface Options {
	app?: string;
	env?: string;
}

const queryAppByName = gql`
	query AppByName($app: String, $env: String) {
		apps(first: 1, name: $app) {
			edges {
				id
				name
				environments(type: $env) {
					id
					name
					type
					getIntegrationsDevEnvConfig {
						data
					}
				}
			}
		}
	}
`;

const queryAppByID = gql`
	query AppByID($id: Int, $env: String) {
		app(id: $id) {
			id
			name
			environments(type: $env) {
				id
				name
				type
				getIntegrationsDevEnvConfig {
					data
				}
			}
		}
	}
`;

async function fetchIntegrations( app: string, env: string ): Promise< Record< string, unknown > > {
	type Integrations = Record< string, unknown >;
	disableGlobalGraphQLErrorHandling();
	const api = API( { exitOnError: false, silenceAuthErrors: true } );
	if ( isNaN( Number( app ) ) ) {
		const res = await api.query< AppByNameQuery, AppByNameQueryVariables >( {
			query: queryAppByName,
			variables: {
				app,
				env,
			},
		} );

		return (
			( res.data.apps?.edges?.[ 0 ]?.environments?.[ 0 ]?.getIntegrationsDevEnvConfig
				?.data as Integrations ) ?? {}
		);
	}

	const res = await api.query< AppByIdQuery, AppByIdQueryVariables >( {
		query: queryAppByID,
		variables: {
			id: Number( app ),
			env,
		},
	} );

	return (
		( res.data.app?.environments?.[ 0 ]?.getIntegrationsDevEnvConfig?.data as Integrations ) ?? {}
	);
}

async function fetchIntegrationsCommand( _args: string[], opts: Options ): Promise< void > {
	let response: Record< string, unknown >;
	if ( opts.app && opts.env ) {
		try {
			response = await fetchIntegrations( opts.app, opts.env );
		} catch ( error: unknown ) {
			const err = error instanceof Error ? error : new Error( String( error ) );
			response = { error: err.message };
			process.exitCode = 1;
		}
	} else {
		response = { error: 'Required parameters missing' };
		process.exitCode = 1;
	}

	process.stdout.write( JSON.stringify( response ) );
}

void command( { usage: 'vip internal fetch-integrations' } ).argv(
	process.argv,
	fetchIntegrationsCommand
);
