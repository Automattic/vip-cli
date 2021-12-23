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

const QUERY_ENVIRONMENT_LOGS = gql`
	query GetAppLogs( $appId: Int, $envId: Int, $type: AppEnvironmentLogType, $limit: Int, $since: String ) {
		app( id: $appId ) {
			environments( id: $envId ) {
				id
				logs( type: $type, limit: $limit, since: $since ) {
					nodes {
						timestamp
						message
					}
				}
			}
		}
	}
`;

export async function getRecentLogs( appId: number, envId: number, type: string, limit: number, since: string ): Promise<Array<{ timestamp: string, message: string }>> {
	const api = await API();

	const response = await api.query( {
		query: QUERY_ENVIRONMENT_LOGS,
		variables: {
			appId,
			envId,
			type,
			limit,
			since,
		},
	} );

	const logs = response?.data?.app?.environments[ 0 ]?.logs?.nodes;

	if ( ! logs ) {
		throw new Error( 'Unable to query logs' );
	}

	return logs;
}
