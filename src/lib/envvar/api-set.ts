import gql from 'graphql-tag';

import API from '../../lib/api';

import type {
	AddEnvironmentVariableMutation,
	AddEnvironmentVariableMutationVariables,
} from './api-set.generated';
import type { ApolloLink } from '@apollo/client/core';

const mutation = gql`
	mutation AddEnvironmentVariable(
		$appId: Int!
		$envId: Int!
		$name: String!
		$value: String!
		$reloadManifest: Boolean!
	) {
		addEnvironmentVariable(
			input: {
				applicationId: $appId
				environmentId: $envId
				name: $name
				value: $value
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

export default async function setEnvVar(
	appId: number,
	envId: number,
	name: string,
	value: string,
	reloadManifest: boolean = false
): Promise< ApolloLink.Result< AddEnvironmentVariableMutation > > {
	const api = API();

	const variables = {
		appId,
		envId,
		name,
		value,
		reloadManifest,
	};

	return api.mutate< AddEnvironmentVariableMutation, AddEnvironmentVariableMutationVariables >( {
		mutation,
		variables,
	} );
}
