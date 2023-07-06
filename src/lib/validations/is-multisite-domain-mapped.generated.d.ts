import * as Types from '../../graphqlTypes';

export type AppMappedDomainsQueryVariables = Types.Exact<{
  appId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  envId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;

export type AppMappedDomainsQuery = {
  __typename?: 'Query',
  app?: {
    __typename?: 'App',
    id?: number | null,
    name?: string | null,
    environments?: Array<{
      __typename?: 'AppEnvironment',
      uniqueLabel?: string | null,
      isMultisite?: boolean | null,
      domains?: {
        __typename?: 'DomainList',
        nodes?: Array<{
          __typename?: 'Domain',
          name: string,
          isPrimary?: boolean | null
        } | null> | null
      } | null
    } | null> | null
  } | null
};
