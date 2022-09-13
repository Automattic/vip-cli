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

export const LIMIT_MAX = 5000;

const QUERY_ENVIRONMENT_LOGS = gql`
	query GetAppLogs( $appId: Int, $envId: Int, $type: AppEnvironmentLogType, $limit: Int, $after: String ) {
		app( id: $appId ) {
			environments( id: $envId ) {
				id
				logs( type: $type, limit: $limit, after: $after ) {
					nodes {
						timestamp
						message
					}
					nextCursor
					pollingDelaySeconds
				}
			}
		}
	}
`;

export async function getRecentLogs( appId, envId, type, limit, after ) {
	const api = await API( { exitOnError: false } );

	const response = await api.query( {
		query: QUERY_ENVIRONMENT_LOGS,
		variables: {
			appId,
			envId,
			type,
			limit,
			after,
		},
	} );

	const logs = response?.data?.app?.environments[ 0 ]?.logs;

	if ( ! logs?.nodes ) {
		throw new Error( 'Unable to query logs' );
	}

	return logs;
}
