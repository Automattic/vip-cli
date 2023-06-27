import * as Types from '../../../graphqlTypes';

export type GetAppSlowlogsQueryVariables = Types.Exact<{
  appId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  envId?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;
