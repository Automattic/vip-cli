import * as Types from '../graphqlTypes';

export type StartMediaImportMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentStartMediaImportInput >;
} >;

export type StartMediaImportMutation = {
	__typename?: 'Mutation';
	startMediaImport?: {
		__typename?: 'AppEnvironmentMediaImportPayload';
		applicationId?: number | null;
		environmentId?: number | null;
		mediaImportStatus: {
			__typename?: 'AppEnvironmentMediaImportStatus';
			importId?: number | null;
			siteId?: number | null;
			status?: string | null;
		};
	} | null;
};
