import * as Types from '../graphqlTypes';

export type StartCustomDeployMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentCustomDeployInput >;
} >;

export type StartCustomDeployMutation = {
	__typename?: 'Mutation';
	startDeploy?: {
		__typename?: 'AppEnvironmentCustomDeployPayload';
		message?: string | null;
		success?: boolean | null;
		app?: { __typename?: 'App'; id?: number | null; name?: string | null } | null;
	} | null;
};
