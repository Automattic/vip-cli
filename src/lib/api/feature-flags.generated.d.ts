import * as Types from '../../graphqlTypes';

export type IsVipQueryVariables = Types.Exact< { [ key: string ]: never } >;

export type IsVipQuery = {
	__typename?: 'Query';
	me?: { __typename?: 'Me'; isVIP?: boolean | null } | null;
};
