import * as Types from '../../graphqlTypes';

export type AppQueryVariables = Types.Exact< {
	appId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
	envId?: Types.InputMaybe< Types.Scalars[ 'Int' ][ 'input' ] >;
} >;

export type AppQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			mediaImportConfig?: {
				__typename?: 'AppEnvironmentMediaImportConfig';
				fileNameCharCount?: number | null;
				fileSizeLimitInBytes?: any | null;
				allowedFileTypes?: any | null;
			} | null;
		} | null > | null;
	} | null;
};
