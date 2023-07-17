/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import {
	GetEnvironmentVariablesWithValuesQuery,
	GetEnvironmentVariablesWithValuesQueryVariables,
} from './api-get-all.generated';
import { EnvironmentVariable } from '../../graphqlTypes';

const query = gql`
	query GetEnvironmentVariablesWithValues($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			id
			environments(id: $envId) {
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

export default async function getEnvVars(
	appId: number,
	envId: number
): Promise< EnvironmentVariable[] | null > {
	const api = await API();

	const variables = {
		appId,
		envId,
	};

	const { data } = await api.query<
		GetEnvironmentVariablesWithValuesQuery,
		GetEnvironmentVariablesWithValuesQueryVariables
	>( { query, variables } );

	return (
		( data.app?.environments?.[ 0 ]?.environmentVariables?.nodes as
			| EnvironmentVariable[]
			| null
			| undefined ) ?? null
	);
}
