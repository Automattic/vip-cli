import * as Types from '../../../graphqlTypes';

export type GetEnvironmentVariablesWithValuesQueryVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  envId: Types.Scalars['Int']['input'];
}>;


export type GetEnvironmentVariablesWithValuesQuery = { __typename?: 'Query', app?: { __typename?: 'App', id?: number | null, environments?: Array<{ __typename?: 'AppEnvironment', id?: number | null, environmentVariables?: { __typename?: 'EnvironmentVariablesList', total?: any | null, nodes?: Array<{ __typename?: 'EnvironmentVariable', name: string, value?: string | null } | null> | null } | null } | null> | null } | null };
