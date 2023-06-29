// @format

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import { GetAppSlowlogsQueryVariables } from './app-slowlogs.generated';
import { Query } from '../../graphqlTypes';

export const LIMIT_MAX = 5000;

const QUERY_ENVIRONMENT_SLOWLOGS = gql`
	query GetAppLogs($appId: Int, $envId: Int, $limit: Int, $after: String) {
		app(id: $appId) {
			environments(id: $envId) {
				id
				slowlogs(limit: $limit, after: $after) {
					nodes {
						timestamp
						rowsSent
						rowsExamined
						queryTime
						requestUri
						query
					}
					nextCursor
					pollingDelaySeconds
				}
			}
		}
	}
`;

interface GetRecentSlowlogsResponse {
	nodes: {
		timestamp: string;
		rowsSent: string;
		rowsExamined: string;
		queryTime: string;
		requestUri: string;
		query: string;
	}[];
	nextCursor: string;
	pollingDelaySeconds: number;
}

export async function getRecentSlowlogs(
	appId: number,
	envId: number,
	limit: number,
	after?: string
): Promise< GetRecentSlowlogsResponse > {
	const api = await API( { exitOnError: false } );

	const response = await api.query< Query, GetAppSlowlogsQueryVariables >( {
		query: QUERY_ENVIRONMENT_SLOWLOGS,
		variables: {
			appId,
			envId,
			limit,
			after,
		},
	} );

	const slowlogs = response.data.app?.environments?.[ 0 ]?.slowlogs;

	if ( ! slowlogs?.nodes ) {
		throw new Error( 'Unable to query slowlogs' );
	}

	return slowlogs as GetRecentSlowlogsResponse;
}
