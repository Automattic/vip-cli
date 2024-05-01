import gql from 'graphql-tag';

import { GetAppLogsQueryVariables } from './app-logs.generated';
import { AppEnvironmentLogType, Query } from '../../graphqlTypes';
import API from '../../lib/api';

export const LIMIT_MAX = 5000;

const QUERY_ENVIRONMENT_LOGS = gql`
	query GetAppLogs(
		$appId: Int
		$envId: Int
		$type: AppEnvironmentLogType
		$limit: Int
		$after: String
	) {
		app(id: $appId) {
			environments(id: $envId) {
				id
				logs(type: $type, limit: $limit, after: $after) {
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

interface GetRecentLogsResponse {
	nodes: { timestamp: string; message: string }[];
	nextCursor: string;
	pollingDelaySeconds: number;
}

export async function getRecentLogs(
	appId: number,
	envId: number,
	type: AppEnvironmentLogType,
	limit: number,
	after?: string
): Promise< GetRecentLogsResponse > {
	const api = API( { exitOnError: false } );

	const response = await api.query< Query, GetAppLogsQueryVariables >( {
		query: QUERY_ENVIRONMENT_LOGS,
		variables: {
			appId,
			envId,
			type,
			limit,
			after,
		},
	} );

	const logs = response.data.app?.environments?.[ 0 ]?.logs;

	if ( ! logs?.nodes ) {
		throw new Error( 'Unable to query logs' );
	}

	return logs as GetRecentLogsResponse;
}
