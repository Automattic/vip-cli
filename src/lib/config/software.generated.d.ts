import * as Types from '../../../graphqlTypes';

export type UpdateSoftwareSettingsMutationVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  envId: Types.Scalars['Int']['input'];
  component: Types.Scalars['String']['input'];
  version: Types.Scalars['String']['input'];
}>;


export type UpdateSoftwareSettingsMutation = { __typename?: 'Mutation', updateSoftwareSettings?: { __typename?: 'AppEnvironmentSoftwareSettings', php?: { __typename?: 'AppEnvironmentSoftwareSettingsSoftware' } | null, wordpress?: { __typename?: 'AppEnvironmentSoftwareSettingsSoftware' } | null, muplugins?: { __typename?: 'AppEnvironmentSoftwareSettingsSoftware' } | null, nodejs?: { __typename?: 'AppEnvironmentSoftwareSettingsSoftware' } | null } | null };

export type UpdateJobQueryVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  envId: Types.Scalars['Int']['input'];
}>;


export type UpdateJobQuery = { __typename?: 'Query', app?: { __typename?: 'App', environments?: Array<{ __typename?: 'AppEnvironment', jobs?: Array<{ __typename?: 'Job', type?: string | null, completedAt?: string | null, createdAt?: string | null, inProgressLock?: boolean | null, progress?: { __typename?: 'JobProgress', status?: string | null, steps?: Array<{ __typename?: 'JobProgressStep', step?: string | null, name?: string | null, status?: string | null } | null> | null } | null } | { __typename?: 'PrimaryDomainSwitchJob', type?: string | null, completedAt?: string | null, createdAt?: string | null, inProgressLock?: boolean | null, progress?: { __typename?: 'JobProgress', status?: string | null, steps?: Array<{ __typename?: 'JobProgressStep', step?: string | null, name?: string | null, status?: string | null } | null> | null } | null } | null> | null } | null> | null } | null };
