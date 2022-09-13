// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const mutation = gql`
	mutation DeleteEnvironmentVariable(
		$appId: Int!
		$envId: Int!
		$name: String!
	) {
		deleteEnvironmentVariable(
			input: {
				applicationId: $appId
				environmentId: $envId
				name: $name
				value: ""
			}
		) {
			environmentVariables {
				total
				nodes {
					name
				}
			}
		}
	}
`;

export default async function deleteEnvVar( appId, envId, name ) {
	const api = await API();

	const variables = {
		appId,
		envId,
		name,
	};

	return api.mutate( { mutation, variables } );
}
