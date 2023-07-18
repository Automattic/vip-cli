import * as Types from '../../graphqlTypes';

export type AppQueryVariables = Types.Exact< {
	appId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	envId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
} >;

export type AppQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			isK8sResident?: boolean | null;
			launched?: boolean | null;
			jobs?: Array<
				| {
						__typename?: 'Job';
						id?: number | null;
						type?: string | null;
						completedAt?: string | null;
						createdAt?: string | null;
						progress?: {
							__typename?: 'JobProgress';
							status?: string | null;
							steps?: Array< {
								__typename?: 'JobProgressStep';
								id?: string | null;
								name?: string | null;
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
						progress?: {
							__typename?: 'JobProgress';
							status?: string | null;
							steps?: Array< {
								__typename?: 'JobProgressStep';
								id?: string | null;
								name?: string | null;
								status?: string | null;
							} | null > | null;
						} | null;
				  }
				| null
			> | null;
			importStatus?: {
				__typename?: 'AppEnvironmentImportStatus';
				dbOperationInProgress?: boolean | null;
				importInProgress?: boolean | null;
				progress?: {
					__typename?: 'AppEnvironmentStatusProgress';
					started_at?: number | null;
					finished_at?: number | null;
					steps?: Array< {
						__typename?: 'AppEnvironmentStatusProgressStep';
						name?: string | null;
						started_at?: number | null;
						finished_at?: number | null;
						result?: string | null;
						output?: Array< string | null > | null;
					} | null > | null;
				} | null;
			} | null;
		} | null > | null;
	} | null;
};
