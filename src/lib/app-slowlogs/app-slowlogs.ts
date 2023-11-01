// @format

import gql from 'graphql-tag';

import { GetAppSlowlogsQueryVariables } from './app-slowlogs.generated';
import { GetRecentSlowlogsResponse } from './types';
import { Query } from '../../graphqlTypes';
import API from '../../lib/api';

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

export async function getRecentSlowlogs(
	appId: number,
	envId: number,
	limit: number,
	after?: string | null
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
