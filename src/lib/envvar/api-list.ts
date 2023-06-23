/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import type {
	GetEnvironmentVariablesQuery,
	GetEnvironmentVariablesQueryVariables,
} from './api-list.generated';

const query = gql`
	query GetEnvironmentVariables($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			id
			environments(id: $envId) {
				id
				environmentVariables {
					total
					nodes {
						name
					}
				}
			}
		}
	}
`;

// List the names (but not values) of environment variables.
export default async function listEnvVars( appId: number, envId: number ): Promise< string[] > {
	const api = await API();

	const variables = {
		appId,
		envId,
	};

	const { data } = await api.query<
		GetEnvironmentVariablesQuery,
		GetEnvironmentVariablesQueryVariables
	>( { query, variables } );

	const nodes = data.app?.environments?.[ 0 ]?.environmentVariables?.nodes ?? [];

	return nodes.map( entry => entry?.name ?? '' );
}
