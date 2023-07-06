import * as Types from '../graphqlTypes';

export type AbortMediaImportMutationVariables = Types.Exact<{
	input?: Types.InputMaybe<Types.AppEnvironmentAbortMediaImportInput>;
}>;

export type AbortMediaImportMutation = {
	__typename?: 'Mutation',
	abortMediaImport?: {
		__typename?: 'AppEnvironmentAbortMediaImportPayload',
		applicationId?: number | null,
		environmentId?: number | null,
		mediaImportStatusChange?: {
			__typename?: 'AppEnvironmentMediaImportStatusChange',
			importId?: number | null,
			siteId?: number | null,
			statusFrom?: string | null,
			statusTo?: string | null
		} | null
	} | null
};
