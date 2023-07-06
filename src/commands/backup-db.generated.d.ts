import * as Types from '../graphqlTypes';

export type TriggerDatabaseBackupMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentTriggerDbBackupInput >;
} >;

export type TriggerDatabaseBackupMutation = {
	__typename?: 'Mutation';
	triggerDatabaseBackup?: {
		__typename?: 'AppEnvironmentTriggerDBBackupPayload';
		success?: boolean | null;
	} | null;
};

export type AppBackupJobStatusQueryVariables = Types.Exact< {
	appId: Types.Scalars[ 'Int' ][ 'input' ];
	envId: Types.Scalars[ 'Int' ][ 'input' ];
} >;

export type AppBackupJobStatusQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		id?: number | null;
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			jobs?: Array<
				| {
						__typename?: 'Job';
						id?: number | null;
						type?: string | null;
						completedAt?: string | null;
						createdAt?: string | null;
						inProgressLock?: boolean | null;
						metadata?: Array< {
							__typename?: 'JobMetadata';
							name?: string | null;
							value?: string | null;
						} | null > | null;
						progress?: { __typename?: 'JobProgress'; status?: string | null } | null;
				  }
				| {
						__typename?: 'PrimaryDomainSwitchJob';
						id?: number | null;
						type?: string | null;
						completedAt?: string | null;
						createdAt?: string | null;
						inProgressLock?: boolean | null;
						metadata?: Array< {
							__typename?: 'JobMetadata';
							name?: string | null;
							value?: string | null;
						} | null > | null;
						progress?: { __typename?: 'JobProgress'; status?: string | null } | null;
				  }
				| null
			> | null;
		} | null > | null;
	} | null;
};
