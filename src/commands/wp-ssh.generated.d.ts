import * as Types from '../graphqlTypes';

export type TriggerWpcliCommandMutationMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.AppEnvironmentTriggerWpcliCommandInput >;
} >;

export type TriggerWpcliCommandMutationMutation = {
	__typename?: 'Mutation';
	triggerWPCLICommandOnAppEnvironment: {
		__typename?: 'AppEnvironmentTriggerWPCLICommandPayload';
		inputToken?: string | null;
		sshAuthentication?: {
			__typename?: 'WPCliSSHAuthentication';
			host: string;
			port: string;
			username: string;
			privateKey: string;
			passphrase: string;
		} | null;
		command?: { __typename?: 'WPCLICommand'; guid?: string | null } | null;
	};
};
