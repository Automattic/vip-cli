import * as Types from '../graphqlTypes';

export type AppsQueryVariables = Types.Exact<{
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;

export type AppsQuery = {
  __typename?: 'Query',
  apps?: {
    __typename?: 'AppList',
    total?: number | null,
    nextCursor?: string | null,
    edges?: Array<{
      __typename?: 'App',
      id?: number | null,
      name?: string | null,
      repo?: string | null
    } | null> | null
  } | null
};
