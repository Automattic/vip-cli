import * as Types from '../../graphqlTypes';

export type GetAppLogsQueryVariables = Types.Exact< {
	appId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	envId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	limit?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	after?: Types.InputMaybe< Types.Scalars[ 'String' ][ 'input' ] >;
} >;

export type GetAppLogsQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			slowlogs?: {
				__typename?: 'AppEnvironmentSlowlogsList';
				nextCursor?: string | null;
				pollingDelaySeconds: number;
				nodes?: Array< {
					__typename?: 'AppEnvironmentSlowlog';
					timestamp?: string | null;
					rowsSent?: string | null;
					rowsExamined?: string | null;
					queryTime?: string | null;
					requestUri?: string | null;
					query?: string | null;
				} | null > | null;
			} | null;
		} | null > | null;
	} | null;
};
