import * as Types from '../../graphqlTypes';

export type MediaImportConfigQueryVariables = Types.Exact< { [ key: string ]: never } >;

export type MediaImportConfigQuery = {
	__typename?: 'Query';
	mediaImportConfig?: {
		__typename?: 'MediaImportConfig';
		fileNameCharCount?: number | null;
		fileSizeLimitInBytes?: any | null;
		allowedFileTypes?: any | null;
	} | null;
};
