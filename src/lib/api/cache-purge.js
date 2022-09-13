/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const mutation = gql`
	mutation PurgePageCacheMutation(
		$appId: Int!
		$envId: Int!
		$urls: [String!]!
	) {
		purgePageCache( input: {
			appId: $appId
			environmentId: $envId
			urls: $urls
		} ) {
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

export async function purgeCache( appId, envId, urls ) {
	const api = await API();

	const variables = {
		appId,
		envId,
		urls,
	};

	const response = await api.mutate( { mutation, variables } );

	const { data: { purgePageCache } } = response;

	return purgePageCache;
}
