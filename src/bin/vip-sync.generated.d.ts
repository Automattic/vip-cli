import * as Types from '../graphqlTypes';

export type SyncEnvironmentMutationMutationVariables = Types.Exact<{
	input?: Types.InputMaybe<Types.AppEnvironmentSyncInput>;
}>;

export type SyncEnvironmentMutationMutation = {
	__typename?: 'Mutation',
	syncEnvironment?: {
		__typename?: 'AppEnvironmentSyncPayload',
		environment?: { __typename?: 'AppEnvironment', id?: number | null } | null
	} | null
};

export type AppQueryVariables = Types.Exact<{
	id?: Types.InputMaybe<Types.Scalars['Int']['input']>;
	sync?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;

export type AppQuery = {
	__typename?: 'Query',
	app?: {
		__typename?: 'App',
		id?: number | null,
		name?: string | null,
		environments?: Array<{
			__typename?: 'AppEnvironment',
			id?: number | null,
			name?: string | null,
			defaultDomain?: string | null,
			branch?: string | null,
			datacenter?: string | null,
			syncProgress?: {
				__typename?: 'AppEnvironmentSyncProgress',
				status?: string | null,
				sync?: number | null,
				steps?: Array<{
					__typename?: 'AppEnvironmentSyncStep',
					name?: string | null,
					status?: string | null
				} | null> | null
			} | null
		} | null> | null
	} | null
};
