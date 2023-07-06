import * as Types from '../../graphqlTypes';

export type AppMultiSiteCheckQueryVariables = Types.Exact<{
  appId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  envId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;

export type AppMultiSiteCheckQuery = {
  __typename?: 'Query',
  app?: {
    __typename?: 'App',
    id?: number | null,
    name?: string | null,
    repo?: string | null,
    environments?: Array<{
      __typename?: 'AppEnvironment',
      id?: number | null,
      appId?: number | null,
      name?: string | null,
      type?: string | null,
      isMultisite?: boolean | null,
      isSubdirectoryMultisite?: boolean | null
    } | null> | null
  } | null
};
