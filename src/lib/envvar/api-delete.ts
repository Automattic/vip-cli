import gql from 'graphql-tag';

import API from '../../lib/api';

import type {
	DeleteEnvironmentVariableMutation,
	DeleteEnvironmentVariableMutationVariables,
} from './api-delete.generated';
import type { FetchResult } from '@apollo/client';

const mutation = gql`
	mutation DeleteEnvironmentVariable($appId: Int!, $envId: Int!, $name: String!) {
		deleteEnvironmentVariable(
			input: { applicationId: $appId, environmentId: $envId, name: $name, value: "" }
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
	name: string
): Promise< FetchResult< DeleteEnvironmentVariableMutation > > {
	const api = API();

	const variables = {
		appId,
		envId,
		name,
	};

	return api.mutate<
		DeleteEnvironmentVariableMutation,
		DeleteEnvironmentVariableMutationVariables
	>( { mutation, variables } );
}
