import * as Types from '../../graphqlTypes';

export type Unnamed_1_QueryVariables = Types.Exact< { [ key: string ]: never } >;

export type Unnamed_1_Query = {
	__typename?: 'Query';
	getMediaImportConfig?: {
		__typename?: 'MediaImportConfig';
		fileNameCharCount?: number | null;
		fileSizeLimitInBytes?: any | null;
		allowedFileTypes?: any | null;
	} | null;
};
