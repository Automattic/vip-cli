// @format

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import type {
	PurgePageCacheMutationMutation,
	PurgePageCacheMutationMutationVariables,
} from './cache-purge.generated';
import type { PurgePageCachePayload } from '../../graphqlTypes';

const mutation = gql`
	mutation PurgePageCacheMutation($appId: Int!, $envId: Int!, $urls: [String!]!) {
		purgePageCache(input: { appId: $appId, environmentId: $envId, urls: $urls }) {
			success
			urls
		}
	}
`;

// The subquery for environments lets users choose any environment, including production.
export const appQuery = `
	id
	name
	environments {
		id
		appId
		name
		primaryDomain {
			name
		}
		type
	}
`;

export async function purgeCache(
	appId: number,
	envId: number,
	urls: string[]
): Promise< PurgePageCachePayload | null > {
	const api = await API();

	const variables = {
		appId,
		envId,
		urls,
	};

	const response = await api.mutate<
		PurgePageCacheMutationMutation,
		PurgePageCacheMutationMutationVariables
	>( { mutation, variables } );
	return response.data?.purgePageCache ?? null;
}
