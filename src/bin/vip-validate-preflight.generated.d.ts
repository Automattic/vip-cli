import * as Types from '../graphqlTypes';

export type BuildConfigQueryVariables = Types.Exact< {
	appId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	envId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
} >;

export type BuildConfigQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			id?: number | null;
			buildConfiguration?: {
				__typename?: 'BuildConfiguration';
				buildType: string;
				nodeBuildDockerEnv: string;
				nodeJSVersion: string;
				npmToken?: string | null;
			} | null;
		} | null > | null;
	} | null;
};
