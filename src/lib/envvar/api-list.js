// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const query = gql`
	query GetEnvironmentVariables(
		$appId: Int!
		$envId: Int!
	) {
		app(
			id: $appId
		) {
			id
			environments(
				id: $envId
			) {
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
export default async function listEnvVars( appId, envId ) {
	const api = await API();

	const variables = {
		appId,
		envId,
	};

	const { data } = await api.query( { query, variables } );

	return data.app.environments[ 0 ].environmentVariables.nodes.map( ( { name } ) => name );
}
