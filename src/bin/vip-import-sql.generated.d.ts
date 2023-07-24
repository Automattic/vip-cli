import * as Types from '../graphqlTypes';

export type StartImportMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentImportInput >;
} >;

export type StartImportMutation = {
	__typename?: 'Mutation';
	startImport?: {
		__typename?: 'AppEnvironmentImportPayload';
		message?: string | null;
		success?: boolean | null;
		app?: { __typename?: 'App'; id?: number | null; name?: string | null } | null;
	} | null;
};
