import * as Types from '../../graphqlTypes';

export type GetAppBackupsV2QueryVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  environmentId: Types.Scalars['Int']['input'];
  permissions?: Types.InputMaybe<Array<Types.InputMaybe<Types.Scalars['String']['input']>> | Types.InputMaybe<Types.Scalars['String']['input']>>;
}>;

export type GetAppBackupsV2Query = {
  __typename?: 'Query',
  app?: {
    __typename?: 'App',
    id?: number | null,
    environments?: Array<{
      __typename?: 'AppEnvironment',
      backups?: {
        __typename?: 'BackupsList',
        total?: number | null,
        nextCursor?: string | null,
        nodes?: Array<{
          __typename?: 'Backup',
          createdAt?: string | null,
          id?: number | null,
          environmentId?: number | null,
          type?: string | null,
          size?: number | null,
          filename?: string | null,
          dataset?: { __typename?: 'DBPartitioningDataset', displayName?: string | null } | null
        } | null> | null
      } | null,
      permissions?: Array<{
        __typename?: 'PermissionResult',
        permission?: string | null,
        isAllowed?: boolean | null
      } | null> | null
    } | null> | null
  } | null
};

export type GetBackupCopiesQueryVariables = Types.Exact<{
  appId: Types.Scalars['Int']['input'];
  environmentId: Types.Scalars['Int']['input'];
}>;

export type GetBackupCopiesQuery = {
  __typename?: 'Query',
  app?: {
    __typename?: 'App',
    environments?: Array<{
      __typename?: 'AppEnvironment',
      dbBackupCopies?: {
        __typename?: 'DBBackupCopyList',
        nextCursor?: string | null,
        nodes: Array<{
          __typename?: 'DBBackupCopy',
          id?: number | null,
          filePath: string,
          config?: {
            __typename?: 'DBBackupCopyConfig',
            backupLabel: string,
            networkSiteId?: number | null,
            siteId: number,
            tables: Array<string>
          } | null
        }>
      } | null
    } | null> | null
  } | null
};
