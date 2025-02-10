import * as Types from '../graphqlTypes';

export type AppByNameQueryVariables = Types.Exact< {
	app?: Types.InputMaybe< Types.Scalars[ 'String' ][ 'input' ] >;
	env?: Types.InputMaybe< Types.Scalars[ 'String' ][ 'input' ] >;
} >;

export type AppByNameQuery = {
	__typename?: 'Query';
	apps?: {
		__typename?: 'AppList';
		edges?: Array< {
			__typename?: 'App';
			id?: number | null;
			name?: string | null;
			environments?: Array< {
				__typename?: 'AppEnvironment';
				id?: number | null;
				name?: string | null;
				type?: string | null;
				getIntegrationsDevEnvConfig?: {
					__typename?: 'IntegrationDevEnvConfig';
					data?: any | null;
				} | null;
			} | null > | null;
		} | null > | null;
	} | null;
};

export type AppByIdQueryVariables = Types.Exact< {
	id?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	env?: Types.InputMaybe< Types.Scalars[ 'String' ][ 'input' ] >;
} >;

export type AppByIdQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		id?: number | null;
		name?: string | null;
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			name?: string | null;
			type?: string | null;
			getIntegrationsDevEnvConfig?: {
				__typename?: 'IntegrationDevEnvConfig';
				data?: any | null;
			} | null;
		} | null > | null;
	} | null;
};
