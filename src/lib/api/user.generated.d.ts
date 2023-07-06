import * as Types from '../../../graphqlTypes';

export type MeQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id?: number | null, displayName?: string | null, isVIP?: boolean | null, organizationRoles?: { __typename?: 'UserOrganizationRoleList', nodes?: Array<{ __typename?: 'UserOrganizationRole', organizationId?: number | null, roleId?: Types.OrgRoleId | null } | null> | null } | null } | null };
