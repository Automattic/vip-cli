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
	query GetAppLogs( $appId: Int, $envId: Int, $type: AppEnvironmentLogType, $limit: Int ) {
		app( id: $appId ) {
			environments( id: $envId ) {
				id
				logs( type: $type, limit: $limit ) {
					nodes {
						timestamp
						message
					}
				}
			}
		}
	}
`;

export async function getRecentLogs( appId: number, envId: number, type: string, limit: number ): Promise<Array<{ timestamp: string, message: string }>> {
	const api = await API();

	const response = await api.query( {
		query: QUERY_ENVIRONMENT_LOGS,
		variables: {
			appId,
			envId,
			type,
			limit,
		},
	} );

	const logs = response?.data?.app?.environments[ 0 ]?.logs?.nodes;

	if ( ! logs ) {
		throw new Error( 'Unable to query logs' );
	}

	if ( ! logs.length ) {
		throw new Error( 'No logs found' );
	}

	return logs;
}
