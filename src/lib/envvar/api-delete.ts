import gql from 'graphql-tag';

import API from '../../lib/api';

import type {
	DeleteEnvironmentVariableMutation,
	DeleteEnvironmentVariableMutationVariables,
} from './api-delete.generated';
import type { ApolloLink } from '@apollo/client/core';

const mutation = gql`
	mutation DeleteEnvironmentVariable(
		$appId: Int!
		$envId: Int!
		$name: String!
		$reloadManifest: Boolean!
	) {
		deleteEnvironmentVariable(
			input: {
				applicationId: $appId
				environmentId: $envId
				name: $name
				value: ""
				reloadManifest: $reloadManifest
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

export default async function deleteEnvVar(
	appId: number,
	envId: number,
	name: string,
	reloadManifest: boolean = false
): Promise< ApolloLink.Result< DeleteEnvironmentVariableMutation > > {
	const api = API();

	const variables = {
		appId,
		envId,
		name,
		reloadManifest,
	};

	return api.mutate<
		DeleteEnvironmentVariableMutation,
		DeleteEnvironmentVariableMutationVariables
	>( { mutation, variables } );
}
