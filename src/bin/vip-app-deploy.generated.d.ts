import * as Types from '../graphqlTypes';

export type StartCustomDeployMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentCustomDeployInput >;
} >;

export type StartCustomDeployMutation = {
	__typename?: 'Mutation';
	startCustomDeploy?: {
		__typename?: 'AppEnvironmentCustomDeployPayload';
		success?: boolean | null;
		message?: string | null;
	} | null;
};
