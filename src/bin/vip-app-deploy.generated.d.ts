import * as Types from '../graphqlTypes';

export type StartDeployMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentDeployInput >;
} >;

export type StartDeployMutation = {
	__typename?: 'Mutation';
	startDeploy?: {
		__typename?: 'AppEnvironmentDeployPayload';
		message?: string | null;
		success?: boolean | null;
		app?: { __typename?: 'App'; id?: number | null; name?: string | null } | null;
	} | null;
};
