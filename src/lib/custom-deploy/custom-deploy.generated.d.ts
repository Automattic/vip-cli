import * as Types from '../../graphqlTypes';

export type ValidateCustomDeployAccessMutationVariables = Types.Exact< { [ key: string ]: never } >;

export type ValidateCustomDeployAccessMutation = {
	__typename?: 'Mutation';
	validateCustomDeployAccess?: {
		__typename?: 'ValidateCustomDeployAccessPayload';
		success?: boolean | null;
		appId?: number | null;
		envId?: number | null;
		envType?: string | null;
		envUniqueLabel?: string | null;
		primaryDomainName?: string | null;
		launched?: boolean | null;
	} | null;
};
