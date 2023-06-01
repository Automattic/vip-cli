import * as Types from '../../../graphqlTypes';

export type GetAppLogsQueryVariables = Types.Exact<{
  appId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  envId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  type?: Types.InputMaybe<Types.AppEnvironmentLogType>;
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type GetAppLogsQuery = { __typename?: 'Query', app?: { __typename?: 'App', environments?: Array<{ __typename?: 'AppEnvironment', id?: number | null, logs?: { __typename?: 'AppEnvironmentLogsList', nextCursor?: string | null, pollingDelaySeconds: number, nodes?: Array<{ __typename?: 'AppEnvironmentLog', timestamp?: string | null, message?: string | null } | null> | null } | null } | null> | null } | null };
