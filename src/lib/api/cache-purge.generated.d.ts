import * as Types from '../../../graphqlTypes';

export type PurgePageCacheMutationMutationVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  envId: Types.Scalars['Int']['input'];
  urls: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type PurgePageCacheMutationMutation = { __typename?: 'Mutation', purgePageCache?: { __typename?: 'PurgePageCachePayload', success: boolean, urls: Array<string> } | null };
