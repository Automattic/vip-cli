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
	mutation PurgeCacheObjectMutation(
		$appId: Int!
		$envId: Int!
		$urls: [String]!
	) {
		purgeCacheObject( input: {
			appId: $appId
			environmentId: $envId
			urls: $urls
		} ) {
			status
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

export async function purgeCache( appId: number, envId: number, urls: Array<string> ) {
	const api = await API();

	const variables = {
		appId,
		envId,
		urls,
	};

	const response = await api.mutate( { mutation, variables } );

	const { data: { purgeCacheObject } } = response;
	if ( ! purgeCacheObject ) {
		throw new Error( 'Something went wrong :(' );
	}

	return purgeCacheObject;
}
