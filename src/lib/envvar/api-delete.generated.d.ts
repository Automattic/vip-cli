import * as Types from '../../../graphqlTypes';

export type DeleteEnvironmentVariableMutationVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  envId: Types.Scalars['Int']['input'];
  name: Types.Scalars['String']['input'];
}>;


export type DeleteEnvironmentVariableMutation = { __typename?: 'Mutation', deleteEnvironmentVariable?: { __typename?: 'EnvironmentVariablesPayload', environmentVariables?: { __typename?: 'EnvironmentVariablesList', total?: any | null, nodes?: Array<{ __typename?: 'EnvironmentVariable', name: string } | null> | null } | null } | null };
