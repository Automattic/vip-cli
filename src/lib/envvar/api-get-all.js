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
	query GetEnvironmentVariablesWithValues(
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
						value
					}
				}
			}
		}
	}
`;

export default async function getEnvVars( appId, envId ) {
	const api = await API();

	const variables = {
		appId,
		envId,
	};

	const { data } = await api.query( { query, variables } );

	return data.app.environments[ 0 ].environmentVariables.nodes;
}

