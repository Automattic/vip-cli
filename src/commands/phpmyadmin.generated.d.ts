import * as Types from '../graphqlTypes';

export type GeneratePhpMyAdminAccessMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.GeneratePhpMyAdminAccessInput >;
} >;

export type GeneratePhpMyAdminAccessMutation = {
	__typename?: 'Mutation';
	generatePHPMyAdminAccess?: {
		__typename?: 'GeneratePhpMyAdminAccessPayload';
		expiresAt?: any | null;
		url?: string | null;
	} | null;
};

export type PhpMyAdminStatusQueryVariables = Types.Exact< {
	appId: Types.Scalars[ 'Int' ][ 'input' ];
	envId: Types.Scalars[ 'Int' ][ 'input' ];
} >;

export type PhpMyAdminStatusQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			phpMyAdminStatus?: { __typename?: 'PHPMyAdminStatus'; status?: string | null } | null;
		} | null > | null;
	} | null;
};

export type EnablePhpMyAdminMutationVariables = Types.Exact< {
	input?: Types.InputMaybe< Types.EnablePhpMyAdminInput >;
} >;

export type EnablePhpMyAdminMutation = {
	__typename?: 'Mutation';
	enablePHPMyAdmin?: { __typename?: 'EnablePhpMyAdminPayload'; success?: boolean | null } | null;
};
