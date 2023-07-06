import * as Types from '../graphqlTypes';

export type TriggerWpcliCommandMutationMutationVariables = Types.Exact<{
	input?: Types.InputMaybe<Types.AppEnvironmentTriggerWpcliCommandInput>;
}>;

export type TriggerWpcliCommandMutationMutation = {
	__typename?: 'Mutation',
	triggerWPCLICommandOnAppEnvironment?: {
		__typename?: 'AppEnvironmentTriggerWPCLICommandPayload',
		inputToken?: string | null,
		command?: { __typename?: 'WPCLICommand', guid?: string | null } | null
	} | null
};

export type CancelWpcliCommandMutationVariables = Types.Exact<{
	input?: Types.InputMaybe<Types.CancelWpcliCommandInput>;
}>;

export type CancelWpcliCommandMutation = {
	__typename?: 'Mutation',
	cancelWPCLICommand?: {
		__typename?: 'CancelWPCLICommandPayload',
		command?: { __typename?: 'WPCLICommand', id?: number | null } | null
	} | null
};
