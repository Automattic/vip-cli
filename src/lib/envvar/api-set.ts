/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import type {
	AddEnvironmentVariableMutation,
	AddEnvironmentVariableMutationVariables,
} from './api-set.generated';
import type { FetchResult } from '@apollo/client';

const mutation = gql`
	mutation AddEnvironmentVariable($appId: Int!, $envId: Int!, $name: String!, $value: String!) {
		addEnvironmentVariable(
			input: { applicationId: $appId, environmentId: $envId, name: $name, value: $value }
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
	value: string
): Promise< FetchResult< AddEnvironmentVariableMutation > > {
	const api = await API();

	const variables = {
		appId,
		envId,
		name,
		value,
	};

	return api.mutate< AddEnvironmentVariableMutation, AddEnvironmentVariableMutationVariables >( {
		mutation,
		variables,
	} );
}
