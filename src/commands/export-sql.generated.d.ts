import * as Types from '../graphqlTypes';

export type AppBackupAndJobStatusQueryVariables = Types.Exact< {
	appId: Types.Scalars[ 'Int' ][ 'input' ];
	envId: Types.Scalars[ 'Int' ][ 'input' ];
} >;

export type AppBackupAndJobStatusQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		id?: number | null;
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			latestBackup?: {
				__typename?: 'Backup';
				id?: number | null;
				type?: string | null;
				size?: number | null;
				filename?: string | null;
				createdAt?: string | null;
			} | null;
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
						progress?: {
							__typename?: 'JobProgress';
							status?: string | null;
							steps?: Array< {
								__typename?: 'JobProgressStep';
								id?: string | null;
								name?: string | null;
								step?: string | null;
								status?: string | null;
							} | null > | null;
						} | null;
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
						progress?: {
							__typename?: 'JobProgress';
							status?: string | null;
							steps?: Array< {
								__typename?: 'JobProgressStep';
								id?: string | null;
								name?: string | null;
								step?: string | null;
								status?: string | null;
							} | null > | null;
						} | null;
				  }
				| null
			> | null;
		} | null > | null;
	} | null;
};

export type GenerateDbBackupCopyUrlMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentGenerateDbBackupCopyUrlInput >;
} >;

export type GenerateDbBackupCopyUrlMutation = {
	__typename?: 'Mutation';
	generateDBBackupCopyUrl?: {
		__typename?: 'AppEnvironmentGenerateDBBackupCopyUrlPayload';
		url?: string | null;
		success?: boolean | null;
	} | null;
};

export type BackupDbCopyMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentStartDbBackupCopyInput >;
} >;

export type BackupDbCopyMutation = {
	__typename?: 'Mutation';
	startDBBackupCopy?: {
		__typename?: 'AppEnvironmentStartDBBackupCopyPayload';
		message?: string | null;
		success?: boolean | null;
	} | null;
};
