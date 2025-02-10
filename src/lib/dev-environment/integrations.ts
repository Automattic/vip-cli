import gql from 'graphql-tag';

import API from '../api';

import type {
	AppByIdQuery,
	AppByIdQueryVariables,
	AppByNameQuery,
	AppByNameQueryVariables,
} from './integrations.generated';

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

export async function fetchIntegrations(
	app: string,
	env: string
): Promise< Record< string, unknown > > {
	type Integrations = Record< string, unknown >;
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
