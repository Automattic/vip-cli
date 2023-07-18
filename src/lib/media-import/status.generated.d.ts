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
			name?: string | null;
			type?: string | null;
			repo?: string | null;
			mediaImportStatus?: {
				__typename?: 'AppEnvironmentMediaImportStatus';
				importId?: number | null;
				siteId?: number | null;
				status?: string | null;
				filesTotal?: number | null;
				filesProcessed?: number | null;
				failureDetails?: {
					__typename?: 'AppEnvironmentMediaImportStatusFailureDetails';
					previousStatus?: string | null;
					globalErrors?: Array< string | null > | null;
					fileErrors?: Array< {
						__typename?: 'AppEnvironmentMediaImportStatusFailureDetailsFileErrors';
						fileName?: string | null;
						errors?: Array< string | null > | null;
					} | null > | null;
				} | null;
			} | null;
		} | null > | null;
	} | null;
};
