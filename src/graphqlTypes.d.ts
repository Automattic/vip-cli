export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string | number; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: any; output: any; }
  /** Date custom scalar type */
  Date: { input: any; output: any; }
};

export type AcceptInvitationInput = {
  invitationCode?: InputMaybe<Scalars['String']['input']>;
};

export type AcceptInvitationPayload = {
  __typename?: 'AcceptInvitationPayload';
  status?: Maybe<Scalars['String']['output']>;
};

export type ActivateCertificateInput = {
  certificateId?: InputMaybe<Scalars['Int']['input']>;
  domainNames?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type ActivateCertificatePayload = {
  __typename?: 'ActivateCertificatePayload';
  certificateId?: Maybe<Scalars['Int']['output']>;
};

export type AddCertificateInput = {
  certificate: Scalars['String']['input'];
  clientId: Scalars['Int']['input'];
  csr: Scalars['String']['input'];
  domainName?: InputMaybe<Scalars['String']['input']>;
  key: Scalars['String']['input'];
  trustedCertificate?: InputMaybe<Scalars['String']['input']>;
};

export type AddCertificatePayload = {
  __typename?: 'AddCertificatePayload';
  certificate?: Maybe<Scalars['String']['output']>;
  certificateId?: Maybe<Scalars['Int']['output']>;
};

export type AddNotificationRecipientInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  meta?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  organizationId: Scalars['BigInt']['input'];
  recipientType: NotificationRecipientType;
  recipientValue: Scalars['String']['input'];
};

export type AddNotificationRecipientPayload = {
  __typename?: 'AddNotificationRecipientPayload';
  notificationRecipient?: Maybe<NotificationRecipient>;
};

export type AddNotificationSubscriptionInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  applicationId?: InputMaybe<Scalars['Int']['input']>;
  description: Scalars['String']['input'];
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  meta?: InputMaybe<Scalars['String']['input']>;
  notificationRecipientId: Scalars['BigInt']['input'];
  organizationId?: InputMaybe<Scalars['Int']['input']>;
};

export type AddNotificationSubscriptionPayload = {
  __typename?: 'AddNotificationSubscriptionPayload';
  notificationRecipientId?: Maybe<Scalars['Int']['output']>;
  notificationSubscriptionId?: Maybe<Scalars['Int']['output']>;
};

export type AggregatedMetricMeasurements = {
  __typename?: 'AggregatedMetricMeasurements';
  measurementUnit?: Maybe<Scalars['String']['output']>;
  measurements: Array<Maybe<MetricMeasurement>>;
  metricDisplayName?: Maybe<Scalars['String']['output']>;
  metricName: Scalars['String']['output'];
  resolution?: Maybe<Scalars['Int']['output']>;
};

export type App = Model & {
  __typename?: 'App';
  active?: Maybe<Scalars['Boolean']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  environments?: Maybe<Array<Maybe<AppEnvironment>>>;
  features?: Maybe<Array<Maybe<Feature>>>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organization?: Maybe<Organization>;
  organizationId?: Maybe<Scalars['Int']['output']>;
  pageviews?: Maybe<Pageviews>;
  permissions?: Maybe<Array<Maybe<PermissionResult>>>;
  primaryEnvironment?: Maybe<AppEnvironment>;
  repo?: Maybe<Scalars['String']['output']>;
  repository?: Maybe<GitRepository>;
  serviceStatus?: Maybe<Scalars['String']['output']>;
  supportPackage?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  typeId?: Maybe<Scalars['Int']['output']>;
};


export type AppEnvironmentsArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type AppPermissionsArgs = {
  permissions?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type AppEnvironment = {
  __typename?: 'AppEnvironment';
  active?: Maybe<Scalars['Boolean']['output']>;
  activeBackup?: Maybe<Backup>;
  allowedIPs?: Maybe<AppEnvironmentIpAllowList>;
  appId?: Maybe<Scalars['Int']['output']>;
  backupPolicyId?: Maybe<Scalars['Int']['output']>;
  backupShippingConfig?: Maybe<AppEnvironmentBackupShipping>;
  backups?: Maybe<BackupsList>;
  basicAuth?: Maybe<AppEnvironmentBasicAuth>;
  branch?: Maybe<Scalars['String']['output']>;
  buildConfiguration?: Maybe<BuildConfiguration>;
  builds?: Maybe<BuildList>;
  /** Get codebase related information */
  codebase?: Maybe<CodebaseInfo>;
  commands?: Maybe<WpcliCommandList>;
  commits?: Maybe<GitCommitList>;
  createdAt?: Maybe<Scalars['String']['output']>;
  currentCommit?: Maybe<Scalars['String']['output']>;
  datacenter?: Maybe<Scalars['String']['output']>;
  dbBackupCopies?: Maybe<DbBackupCopyList>;
  dbOperationInProgress?: Maybe<Scalars['Boolean']['output']>;
  defaultDomain?: Maybe<Scalars['String']['output']>;
  deployments?: Maybe<DeploymentList>;
  deploys?: Maybe<DeployList>;
  domains?: Maybe<DomainList>;
  environmentVariables?: Maybe<EnvironmentVariablesList>;
  events?: Maybe<AuditEventList>;
  health?: Maybe<AppEnvironmentHealth>;
  hstsSettings?: Maybe<AppEnvironmentHstsSettings>;
  icon?: Maybe<AppEnvironmentIcon>;
  id?: Maybe<Scalars['Int']['output']>;
  importStatus?: Maybe<AppEnvironmentImportStatus>;
  ips?: Maybe<AppEnvironmentIPs>;
  isDBPartitioningEnabled?: Maybe<Scalars['Boolean']['output']>;
  isK8sResident?: Maybe<Scalars['Boolean']['output']>;
  isMultisite?: Maybe<Scalars['Boolean']['output']>;
  isOnLatestCode?: Maybe<Scalars['Boolean']['output']>;
  isSubdirectoryMultisite?: Maybe<Scalars['Boolean']['output']>;
  jobs?: Maybe<Array<Maybe<JobInterface>>>;
  latestBackup?: Maybe<Backup>;
  latestMediaExport?: Maybe<MediaExport>;
  launchModeEndAt?: Maybe<Scalars['String']['output']>;
  launched?: Maybe<Scalars['Boolean']['output']>;
  logs?: Maybe<AppEnvironmentLogsList>;
  logsConfig?: Maybe<AppEnvironmentLogShipping>;
  mediaExports?: Maybe<MediaExportsList>;
  mediaImportStatus?: Maybe<AppEnvironmentMediaImportStatus>;
  metrics?: Maybe<AggregatedMetricMeasurements>;
  name?: Maybe<Scalars['String']['output']>;
  notificationSubscriptions?: Maybe<NotificationSubscriptionList>;
  permissions?: Maybe<Array<Maybe<PermissionResult>>>;
  primaryDomain?: Maybe<Domain>;
  primaryDomainSwitchProgress?: Maybe<AppEnvironmentPrimaryDomainSwitchProgress>;
  pullRequests?: Maybe<GitHubPullRequestList>;
  repo?: Maybe<Scalars['String']['output']>;
  requestStats?: Maybe<RequestStatsList>;
  slowlogs?: Maybe<AppEnvironmentSlowlogsList>;
  software?: Maybe<AppEnvironmentSoftwareDetails>;
  softwareSettings?: Maybe<AppEnvironmentSoftwareSettings>;
  syncPreview?: Maybe<AppEnvironmentSyncPreview>;
  syncProgress?: Maybe<AppEnvironmentSyncProgress>;
  type?: Maybe<Scalars['String']['output']>;
  uniqueLabel?: Maybe<Scalars['String']['output']>;
  updateSubsiteDomainStatus?: Maybe<AppEnvironmentUpdateSubsiteDomainStatus>;
  /** Get WordPress Site Installation Details */
  wpInstallation?: Maybe<WpInstallation>;
  /** Get WordPress Site Details */
  wpSites?: Maybe<WpSiteList>;
  /** Get WordPress Site Details from SDS */
  wpSitesSDS?: Maybe<WpSiteList>;
};


export type AppEnvironmentBackupsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Float']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentCommandsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentCommitsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentDbBackupCopiesArgs = {
  fileNames?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type AppEnvironmentDeploymentsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  nextCursor?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentDeploysArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentDomainsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  matching?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentHealthArgs = {
  startDate?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentIconArgs = {
  size?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentJobsArgs = {
  jobTypes?: InputMaybe<Array<AppEnvironmentJobType>>;
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type AppEnvironmentLogsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<AppEnvironmentLogType>;
};


export type AppEnvironmentMediaExportsArgs = {
  nextCursor?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentMetricsArgs = {
  fromDate?: InputMaybe<Scalars['Date']['input']>;
  metricName?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['Date']['input']>;
};


export type AppEnvironmentPermissionsArgs = {
  permissions?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type AppEnvironmentPrimaryDomainSwitchProgressArgs = {
  primaryDomainSwitchId?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentPullRequestsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentRequestStatsArgs = {
  date?: InputMaybe<Scalars['String']['input']>;
  days?: InputMaybe<Scalars['Int']['input']>;
  from?: InputMaybe<Scalars['String']['input']>;
  months?: InputMaybe<Scalars['Int']['input']>;
  to?: InputMaybe<Scalars['String']['input']>;
};


export type AppEnvironmentSlowlogsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentSyncProgressArgs = {
  sync?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentWpSitesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type AppEnvironmentWpSitesSdsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  blogId?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  launchStatus?: InputMaybe<WpSiteLaunchStatus>;
  matching?: InputMaybe<Scalars['String']['input']>;
};

/** Mutation request input to abort a Media Import */
export type AppEnvironmentAbortMediaImportInput = {
  /** The unique ID of the Application */
  applicationId: Scalars['Int']['input'];
  /** The uniqueID of the Environment */
  environmentId: Scalars['Int']['input'];
};

/** Response payload for aborting a Media Import */
export type AppEnvironmentAbortMediaImportPayload = {
  __typename?: 'AppEnvironmentAbortMediaImportPayload';
  /** The unique ID of the Application */
  applicationId?: Maybe<Scalars['Int']['output']>;
  /** The unique ID of the Environment */
  environmentId?: Maybe<Scalars['Int']['output']>;
  /** Media Import Abort Action Response */
  mediaImportStatusChange?: Maybe<AppEnvironmentMediaImportStatusChange>;
};

/** Variables for the Activate Let's Encrypt Mutation */
export type AppEnvironmentActivateLetsEncryptOnDomainInput = {
  /** The unique ID for the domain */
  domainId?: InputMaybe<Scalars['Int']['input']>;
  /** The ID of the environment that this domain belongs to */
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  /** The unique ID for the domain */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Provisions the www-alt domain */
  includeWWW?: InputMaybe<Scalars['Boolean']['input']>;
  /** Overrides the existing certificate (if any) on the domain */
  overrideExisting?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Response from the Activate Let's Encrypt Mutation */
export type AppEnvironmentActivateLetsEncryptOnDomainPayload = {
  __typename?: 'AppEnvironmentActivateLetsEncryptOnDomainPayload';
  /** The domain that Let's Encrypt was activated on */
  domain?: Maybe<Domain>;
};

/** Variables for the Add Domain mutation */
export type AppEnvironmentAddDomainInput = {
  /** The domain name (i.e. something like example.com or sub.example.com) */
  domain?: InputMaybe<NewDomain>;
  /** The ID of the environment that this domain belongs to */
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  /** The unique ID for the domain */
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentAddDomainPayload = {
  __typename?: 'AppEnvironmentAddDomainPayload';
  domain?: Maybe<Domain>;
};

/** Variables for the AddRequestStats mutation */
export type AppEnvironmentAddRequestStatsInput = {
  /** The application ID */
  applicationId: Scalars['Int']['input'];
  /** Date for which we want to sync - if we want to sync only for one day */
  date?: InputMaybe<Scalars['String']['input']>;
  /** The environment ID where we want to run the command */
  environmentId: Scalars['Int']['input'];
  /** Date range for which we want to sync - if we want to sync for a range */
  fromDate?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};

/** Response payload for Request Stats */
export type AppEnvironmentAddRequestStatsPayload = {
  __typename?: 'AppEnvironmentAddRequestStatsPayload';
  /** The unique ID of the Application */
  applicationId: Scalars['Int']['output'];
  /** The unique ID of the environment */
  environmentId: Scalars['Int']['output'];
};

export type AppEnvironmentBackup = {
  __typename?: 'AppEnvironmentBackup';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  size?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentBackupShipping = {
  __typename?: 'AppEnvironmentBackupShipping';
  awsAccountId?: Maybe<Scalars['String']['output']>;
  bucket?: Maybe<Scalars['String']['output']>;
  dailyHour?: Maybe<Scalars['Int']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  schedule?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentBackupShippingInput = {
  awsAccountId?: InputMaybe<Scalars['String']['input']>;
  bucket?: InputMaybe<Scalars['String']['input']>;
  dailyHour?: InputMaybe<Scalars['Int']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  schedule?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentBackupShippingPayload = {
  __typename?: 'AppEnvironmentBackupShippingPayload';
  app?: Maybe<App>;
  awsAccountId?: Maybe<Scalars['String']['output']>;
  bucket?: Maybe<Scalars['String']['output']>;
  dailyHour?: Maybe<Scalars['Int']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  schedule?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentBackupShippingValidationPayload = {
  __typename?: 'AppEnvironmentBackupShippingValidationPayload';
  app?: Maybe<App>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

export type AppEnvironmentBasicAuth = {
  __typename?: 'AppEnvironmentBasicAuth';
  total?: Maybe<Scalars['Int']['output']>;
  users?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type AppEnvironmentBasicAuthDeleteInput = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  username?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type AppEnvironmentBasicAuthInput = {
  basicAuth?: InputMaybe<Array<InputMaybe<AppEnvironmentBasicAuthUserInput>>>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentBasicAuthPayload = {
  __typename?: 'AppEnvironmentBasicAuthPayload';
  app?: Maybe<App>;
  user?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentBasicAuthUserInput = {
  password?: InputMaybe<Scalars['String']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentDeactivateDomainInput = {
  domainId?: InputMaybe<Scalars['Int']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentDeactivateDomainPayload = {
  __typename?: 'AppEnvironmentDeactivateDomainPayload';
  domain?: Maybe<Domain>;
};

export type AppEnvironmentEnableLaunchModeInput = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  launchModeEndAt?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentEnableLaunchModePayload = {
  __typename?: 'AppEnvironmentEnableLaunchModePayload';
  app?: Maybe<App>;
  environment?: Maybe<AppEnvironment>;
};

export type AppEnvironmentGenerateDbBackupCopyUrlInput = {
  backupId?: InputMaybe<Scalars['Float']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentGenerateDbBackupCopyUrlPayload = {
  __typename?: 'AppEnvironmentGenerateDBBackupCopyUrlPayload';
  app?: Maybe<App>;
  success?: Maybe<Scalars['Boolean']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentGenerateMediaExportSignedUrlInput = {
  appId?: InputMaybe<Scalars['Int']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  mediaExportId?: InputMaybe<Scalars['Float']['input']>;
  target?: InputMaybe<AppEnvironmentGenerateMediaExportSignedUrlTarget>;
};

export type AppEnvironmentGenerateMediaExportSignedUrlPayload = {
  __typename?: 'AppEnvironmentGenerateMediaExportSignedUrlPayload';
  success?: Maybe<Scalars['Boolean']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export enum AppEnvironmentGenerateMediaExportSignedUrlTarget {
  Media = 'media',
  Report = 'report'
}

export type AppEnvironmentGenericSoftware = AppEnvironmentSoftware & {
  __typename?: 'AppEnvironmentGenericSoftware';
  version: Scalars['String']['output'];
};

/** Details about the environment's HSTS settings */
export type AppEnvironmentHstsSettings = {
  __typename?: 'AppEnvironmentHSTSSettings';
  /** Whether HSTS is enabled for an App Environment */
  enabled?: Maybe<Scalars['Boolean']['output']>;
  /** Whether the header includes the includesSubdomains directive */
  includeSubdomains?: Maybe<Scalars['Boolean']['output']>;
  /** The value of the max-age directive */
  maxAge?: Maybe<Scalars['Int']['output']>;
  /** Whether the header includes the preload directive */
  preload?: Maybe<Scalars['Boolean']['output']>;
  /** Whether the App Environment enforces HTTPS everywhere */
  sslEverywhere?: Maybe<Scalars['Boolean']['output']>;
};

/** Variables for the UpdateHSTSSettings mutation */
export type AppEnvironmentHstsSettingsInput = {
  /** The unique ID of the Environment */
  environmentId: Scalars['Int']['input'];
  /** The unique ID of the Application */
  id: Scalars['Int']['input'];
  /** Whether the header should include the includesSubdomains directive */
  includeSubdomains?: InputMaybe<Scalars['Boolean']['input']>;
  /** The value of the max-age directive */
  maxAge?: InputMaybe<Scalars['Int']['input']>;
  /** Whether the header should include the preload directive */
  preload?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Response payload for HSTS Settings updates */
export type AppEnvironmentHstsSettingsPayload = {
  __typename?: 'AppEnvironmentHSTSSettingsPayload';
  /** The Application that was updated */
  app?: Maybe<App>;
  /** The response message from GOOP */
  message?: Maybe<Scalars['String']['output']>;
  /** Whether the update was successful */
  success?: Maybe<Scalars['Boolean']['output']>;
};

export type AppEnvironmentHealth = {
  __typename?: 'AppEnvironmentHealth';
  cacheHit?: Maybe<AppEnvironmentHealthCacheList>;
  cacheMiss?: Maybe<AppEnvironmentHealthCacheList>;
  responseCodes?: Maybe<AppEnvironmentHealthList>;
};

export type AppEnvironmentHealthCacheList = {
  __typename?: 'AppEnvironmentHealthCacheList';
  nodes?: Maybe<Array<Maybe<AppEnvironmentHealthCacheNodes>>>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type AppEnvironmentHealthCacheNodes = {
  __typename?: 'AppEnvironmentHealthCacheNodes';
  from?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Scalars['String']['output']>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type AppEnvironmentHealthList = {
  __typename?: 'AppEnvironmentHealthList';
  codes?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  nodes?: Maybe<Array<Maybe<AppEnvironmentHealthNodes>>>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type AppEnvironmentHealthNodes = {
  __typename?: 'AppEnvironmentHealthNodes';
  _200?: Maybe<Scalars['BigInt']['output']>;
  _201?: Maybe<Scalars['BigInt']['output']>;
  _206?: Maybe<Scalars['BigInt']['output']>;
  _301?: Maybe<Scalars['BigInt']['output']>;
  _302?: Maybe<Scalars['BigInt']['output']>;
  _304?: Maybe<Scalars['BigInt']['output']>;
  _400?: Maybe<Scalars['BigInt']['output']>;
  _401?: Maybe<Scalars['BigInt']['output']>;
  _403?: Maybe<Scalars['BigInt']['output']>;
  _404?: Maybe<Scalars['BigInt']['output']>;
  _405?: Maybe<Scalars['BigInt']['output']>;
  _408?: Maybe<Scalars['BigInt']['output']>;
  _412?: Maybe<Scalars['BigInt']['output']>;
  _416?: Maybe<Scalars['BigInt']['output']>;
  _429?: Maybe<Scalars['BigInt']['output']>;
  _499?: Maybe<Scalars['BigInt']['output']>;
  _500?: Maybe<Scalars['BigInt']['output']>;
  _502?: Maybe<Scalars['BigInt']['output']>;
  _503?: Maybe<Scalars['BigInt']['output']>;
  _504?: Maybe<Scalars['BigInt']['output']>;
  from?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Scalars['String']['output']>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type AppEnvironmentIpAllowList = {
  __typename?: 'AppEnvironmentIPAllowList';
  ips?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentIpAllowListInput = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  ips?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type AppEnvironmentIpAllowListPayload = {
  __typename?: 'AppEnvironmentIPAllowListPayload';
  app?: Maybe<App>;
  ips?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type AppEnvironmentIPs = {
  __typename?: 'AppEnvironmentIPs';
  ipv4?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  ipv6?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type AppEnvironmentIcon = {
  __typename?: 'AppEnvironmentIcon';
  height?: Maybe<Scalars['Int']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  width?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentImportInput = {
  basename?: InputMaybe<Scalars['String']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  md5?: InputMaybe<Scalars['String']['input']>;
  searchReplace?: InputMaybe<Array<InputMaybe<AppEnvironmentImportSearchReplace>>>;
};

export type AppEnvironmentImportPayload = {
  __typename?: 'AppEnvironmentImportPayload';
  app?: Maybe<App>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

export type AppEnvironmentImportSearchReplace = {
  from?: InputMaybe<Scalars['String']['input']>;
  to?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentImportStatus = {
  __typename?: 'AppEnvironmentImportStatus';
  dbOperationInProgress?: Maybe<Scalars['Boolean']['output']>;
  importInProgress?: Maybe<Scalars['Boolean']['output']>;
  progress?: Maybe<AppEnvironmentStatusProgress>;
};

export enum AppEnvironmentJobType {
  DbBackupCopy = 'db_backup_copy',
  SetPrimaryDomain = 'set_primary_domain',
  SqlImport = 'sql_import',
  UpdateSubsiteDomain = 'update_subsite_domain',
  UpgradeMuplugins = 'upgrade_muplugins',
  UpgradeNodejs = 'upgrade_nodejs',
  UpgradePhp = 'upgrade_php',
  UpgradeWordpress = 'upgrade_wordpress'
}

export type AppEnvironmentLaunchedInput = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentLaunchedPayload = {
  __typename?: 'AppEnvironmentLaunchedPayload';
  app?: Maybe<App>;
  environment?: Maybe<AppEnvironment>;
};

export type AppEnvironmentLog = {
  __typename?: 'AppEnvironmentLog';
  message?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentLogShipping = {
  __typename?: 'AppEnvironmentLogShipping';
  awsAccountId?: Maybe<Scalars['String']['output']>;
  bucket?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  region?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentLogShippingInput = {
  awsAccountId?: InputMaybe<Scalars['String']['input']>;
  bucket?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentLogShippingPayload = {
  __typename?: 'AppEnvironmentLogShippingPayload';
  app?: Maybe<App>;
  awsAccountId?: Maybe<Scalars['String']['output']>;
  bucket?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  region?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentLogShippingValidationPayload = {
  __typename?: 'AppEnvironmentLogShippingValidationPayload';
  app?: Maybe<App>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

export enum AppEnvironmentLogType {
  App = 'app',
  Batch = 'batch'
}

export type AppEnvironmentLogsList = {
  __typename?: 'AppEnvironmentLogsList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<AppEnvironmentLog>>>;
  pollingDelaySeconds: Scalars['Int']['output'];
  total?: Maybe<Scalars['BigInt']['output']>;
};

/** Response payload for starting and fetching a Media Import */
export type AppEnvironmentMediaImportPayload = {
  __typename?: 'AppEnvironmentMediaImportPayload';
  /** The unique ID of the Application */
  applicationId?: Maybe<Scalars['Int']['output']>;
  /** The unique ID of the Environment */
  environmentId?: Maybe<Scalars['Int']['output']>;
  /** Media Import Status */
  mediaImportStatus: AppEnvironmentMediaImportStatus;
};

/** Current status of a Media Import */
export type AppEnvironmentMediaImportStatus = {
  __typename?: 'AppEnvironmentMediaImportStatus';
  /** Media Import failure details */
  failureDetails?: Maybe<AppEnvironmentMediaImportStatusFailureDetails>;
  /** Total number of media files that were imported */
  filesProcessed?: Maybe<Scalars['Int']['output']>;
  /** Total number of media files that are to be import */
  filesTotal?: Maybe<Scalars['Int']['output']>;
  /** Unique Identifier for a Media Import */
  importId?: Maybe<Scalars['Int']['output']>;
  /** Alias of environmentId */
  siteId?: Maybe<Scalars['Int']['output']>;
  /** The actual status of the Media Import */
  status?: Maybe<Scalars['String']['output']>;
};

/** Response payload for executing a status change action on a Media Import */
export type AppEnvironmentMediaImportStatusChange = {
  __typename?: 'AppEnvironmentMediaImportStatusChange';
  /** Unique Identifier for a Media Import */
  importId?: Maybe<Scalars['Int']['output']>;
  /** Alias of environmentId */
  siteId?: Maybe<Scalars['Int']['output']>;
  /** The status of Media Import prior to status change action */
  statusFrom?: Maybe<Scalars['String']['output']>;
  /** The status of Media Import after the status change action */
  statusTo?: Maybe<Scalars['String']['output']>;
};

/** Media Import Failure details */
export type AppEnvironmentMediaImportStatusFailureDetails = {
  __typename?: 'AppEnvironmentMediaImportStatusFailureDetails';
  /** List of errors per file */
  fileErrors?: Maybe<Array<Maybe<AppEnvironmentMediaImportStatusFailureDetailsFileErrors>>>;
  /** List of global errors per import */
  globalErrors?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  /** Status of the Media Import prior to failing */
  previousStatus?: Maybe<Scalars['String']['output']>;
};

/** Media Import File Errors */
export type AppEnvironmentMediaImportStatusFailureDetailsFileErrors = {
  __typename?: 'AppEnvironmentMediaImportStatusFailureDetailsFileErrors';
  /** List of Errors per file */
  errors?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  /** File Name */
  fileName?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentPrimaryDomainSwitchInput = {
  domainId?: InputMaybe<Scalars['Int']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentPrimaryDomainSwitchPayload = {
  __typename?: 'AppEnvironmentPrimaryDomainSwitchPayload';
  app?: Maybe<App>;
  domain?: Maybe<Domain>;
  environment?: Maybe<AppEnvironment>;
  primaryDomainSwitchId?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentPrimaryDomainSwitchProgress = {
  __typename?: 'AppEnvironmentPrimaryDomainSwitchProgress';
  destinationDomain?: Maybe<Scalars['String']['output']>;
  primaryDomainSwitchId?: Maybe<Scalars['Int']['output']>;
  sourceDomain?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  steps?: Maybe<Array<Maybe<AppEnvironmentPrimaryDomainSwitchProgressStep>>>;
};

export type AppEnvironmentPrimaryDomainSwitchProgressStep = {
  __typename?: 'AppEnvironmentPrimaryDomainSwitchProgressStep';
  name?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  step?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSlowlog = {
  __typename?: 'AppEnvironmentSlowlog';
  query?: Maybe<Scalars['String']['output']>;
  queryTime?: Maybe<Scalars['String']['output']>;
  requestUri?: Maybe<Scalars['String']['output']>;
  rowsExamined?: Maybe<Scalars['String']['output']>;
  rowsSent?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSlowlogsList = {
  __typename?: 'AppEnvironmentSlowlogsList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<AppEnvironmentSlowlog>>>;
  pollingDelaySeconds: Scalars['Int']['output'];
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type AppEnvironmentSoftware = {
  version: Scalars['String']['output'];
};

export type AppEnvironmentSoftwareDetails = {
  __typename?: 'AppEnvironmentSoftwareDetails';
  nodejs?: Maybe<AppEnvironmentGenericSoftware>;
  php?: Maybe<AppEnvironmentGenericSoftware>;
  wordpress?: Maybe<AppEnvironmentGenericSoftware>;
};

export type AppEnvironmentSoftwareSettings = {
  __typename?: 'AppEnvironmentSoftwareSettings';
  muplugins?: Maybe<AppEnvironmentSoftwareSettingsSoftware>;
  nodejs?: Maybe<AppEnvironmentSoftwareSettingsSoftware>;
  php?: Maybe<AppEnvironmentSoftwareSettingsSoftware>;
  wordpress?: Maybe<AppEnvironmentSoftwareSettingsSoftware>;
};

/** Variables for the UpdateSoftwareSettings mutation */
export type AppEnvironmentSoftwareSettingsInput = {
  /** The unique ID of the Application */
  appId: Scalars['Int']['input'];
  /** The unique ID of the Environment */
  environmentId: Scalars['Int']['input'];
  /** The name of the software being updated */
  softwareName: Scalars['String']['input'];
  /** The version the software is being updated to */
  softwareVersion: Scalars['String']['input'];
};

export type AppEnvironmentSoftwareSettingsSoftware = {
  __typename?: 'AppEnvironmentSoftwareSettingsSoftware';
  current: AppEnvironmentSoftwareSettingsVersion;
  name: Scalars['String']['output'];
  options: Array<AppEnvironmentSoftwareSettingsVersion>;
  pinned: Scalars['Boolean']['output'];
  slug: Scalars['String']['output'];
};

export type AppEnvironmentSoftwareSettingsVersion = {
  __typename?: 'AppEnvironmentSoftwareSettingsVersion';
  compatible: Scalars['Boolean']['output'];
  default: Scalars['Boolean']['output'];
  deprecated: Scalars['Boolean']['output'];
  latestRelease: Scalars['String']['output'];
  private: Scalars['Boolean']['output'];
  unstable: Scalars['Boolean']['output'];
  version: Scalars['String']['output'];
};

export type AppEnvironmentStartDbBackupCopyInput = {
  backupId?: InputMaybe<Scalars['Float']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  subsiteId?: InputMaybe<Scalars['Int']['input']>;
  tables?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type AppEnvironmentStartDbBackupCopyPayload = {
  __typename?: 'AppEnvironmentStartDBBackupCopyPayload';
  app?: Maybe<App>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

/** Mutation request input to start a Media Import */
export type AppEnvironmentStartMediaImportInput = {
  /** The unique ID of the Application */
  applicationId: Scalars['Int']['input'];
  /** Publicly accessible URL that contains an archive of the media files to be imported */
  archiveUrl: Scalars['String']['input'];
  /** The uniqueID of the Environment */
  environmentId: Scalars['Int']['input'];
  /** Whether to import intermediate images or not */
  importIntermediateImages?: InputMaybe<Scalars['Boolean']['input']>;
  /** Whether to overwrite existing files or not */
  overwriteExistingFiles?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AppEnvironmentStatusProgress = {
  __typename?: 'AppEnvironmentStatusProgress';
  finished_at?: Maybe<Scalars['Int']['output']>;
  started_at?: Maybe<Scalars['Int']['output']>;
  steps?: Maybe<Array<Maybe<AppEnvironmentStatusProgressStep>>>;
};

export type AppEnvironmentStatusProgressStep = {
  __typename?: 'AppEnvironmentStatusProgressStep';
  finished_at?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  output?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  result?: Maybe<Scalars['String']['output']>;
  started_at?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentSyncConfig = {
  __typename?: 'AppEnvironmentSyncConfig';
  files?: Maybe<Array<Maybe<AppEnvironmentSyncConfigFile>>>;
  settingsYml?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSyncConfigFile = {
  __typename?: 'AppEnvironmentSyncConfigFile';
  apiUrl?: Maybe<Scalars['String']['output']>;
  branch?: Maybe<Scalars['String']['output']>;
  contents?: Maybe<Scalars['String']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  repo?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSyncError = {
  __typename?: 'AppEnvironmentSyncError';
  code?: Maybe<Scalars['String']['output']>;
  message?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSyncInput = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

export type AppEnvironmentSyncPayload = {
  __typename?: 'AppEnvironmentSyncPayload';
  app?: Maybe<App>;
  environment?: Maybe<AppEnvironment>;
};

export type AppEnvironmentSyncPreview = {
  __typename?: 'AppEnvironmentSyncPreview';
  backup?: Maybe<AppEnvironmentBackup>;
  canSync?: Maybe<Scalars['Boolean']['output']>;
  config?: Maybe<AppEnvironmentSyncConfig>;
  errors?: Maybe<Array<Maybe<AppEnvironmentSyncError>>>;
  from?: Maybe<AppEnvironment>;
  replacements?: Maybe<Array<Maybe<AppEnvironmentSyncReplacement>>>;
  sourceEnvironment?: Maybe<AppEnvironment>;
  to?: Maybe<AppEnvironment>;
};

export type AppEnvironmentSyncProgress = {
  __typename?: 'AppEnvironmentSyncProgress';
  finished_at?: Maybe<Scalars['Int']['output']>;
  started_at?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  steps?: Maybe<Array<Maybe<AppEnvironmentSyncStep>>>;
  sync?: Maybe<Scalars['Int']['output']>;
};

export type AppEnvironmentSyncReplacement = {
  __typename?: 'AppEnvironmentSyncReplacement';
  from?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentSyncStep = {
  __typename?: 'AppEnvironmentSyncStep';
  name?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  step?: Maybe<Scalars['String']['output']>;
};

/** Variables for the Run WP-CLI Command mutation */
export type AppEnvironmentTriggerWpcliCommandInput = {
  /** The command we want to run. Note: should not include 'wp' */
  command?: InputMaybe<Scalars['String']['input']>;
  /** The environment ID where we want to run the command */
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  /** The application ID */
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** Response from the Run WP-CLI Command mutation */
export type AppEnvironmentTriggerWpcliCommandPayload = {
  __typename?: 'AppEnvironmentTriggerWPCLICommandPayload';
  /** The command that was executed */
  command?: Maybe<WpcliCommand>;
  /** The token for authenticating the socket connection */
  inputToken?: Maybe<Scalars['String']['output']>;
};

export type AppEnvironmentUpdateSubsiteDomainInput = {
  domainId?: InputMaybe<Scalars['Int']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  subsiteId?: InputMaybe<Scalars['Int']['input']>;
  subsitePath?: InputMaybe<Scalars['String']['input']>;
};

export type AppEnvironmentUpdateSubsiteDomainPayload = {
  __typename?: 'AppEnvironmentUpdateSubsiteDomainPayload';
  app?: Maybe<App>;
  domain?: Maybe<Domain>;
  environment?: Maybe<AppEnvironment>;
};

export type AppEnvironmentUpdateSubsiteDomainStatus = {
  __typename?: 'AppEnvironmentUpdateSubsiteDomainStatus';
  dbOperationInProgress?: Maybe<Scalars['Boolean']['output']>;
  progress?: Maybe<AppEnvironmentStatusProgress>;
  updateSubsiteDomainInProgress?: Maybe<Scalars['Boolean']['output']>;
};

export type AppFeatureInput = {
  context?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type AppFeaturePayload = {
  __typename?: 'AppFeaturePayload';
  features?: Maybe<Array<Maybe<Feature>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type AppList = ModelList & {
  __typename?: 'AppList';
  edges?: Maybe<Array<Maybe<App>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<App>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type ApplicationRole = {
  __typename?: 'ApplicationRole';
  extends?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export enum ApplicationRoleId {
  Admin = 'admin',
  Read = 'read',
  Write = 'write'
}

export type AuditEvent = {
  __typename?: 'AuditEvent';
  actor?: Maybe<AuditEventActor>;
  app?: Maybe<App>;
  description?: Maybe<Scalars['String']['output']>;
  environment?: Maybe<AppEnvironment>;
  environmentId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  meta?: Maybe<Array<Maybe<AuditEventMeta>>>;
  recordedTime?: Maybe<Scalars['Date']['output']>;
  source?: Maybe<AuditEventSource>;
  target?: Maybe<AuditEventTarget>;
  title?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type AuditEventActor = {
  __typename?: 'AuditEventActor';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  isVIP?: Maybe<Scalars['Boolean']['output']>;
  permission?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};


export type AuditEventActorAvatarUrlArgs = {
  width?: InputMaybe<Scalars['Int']['input']>;
};

export type AuditEventList = {
  __typename?: 'AuditEventList';
  edges?: Maybe<Array<Maybe<AuditEvent>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<AuditEvent>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type AuditEventMeta = {
  __typename?: 'AuditEventMeta';
  key: Scalars['String']['output'];
  value?: Maybe<Scalars['String']['output']>;
};

export type AuditEventSource = {
  __typename?: 'AuditEventSource';
  type?: Maybe<Scalars['String']['output']>;
  version?: Maybe<Scalars['String']['output']>;
};

export type AuditEventTarget = {
  __typename?: 'AuditEventTarget';
  id?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type Backup = {
  __typename?: 'Backup';
  createdAt?: Maybe<Scalars['String']['output']>;
  dataset?: Maybe<DbPartitioningDataset>;
  environmentId?: Maybe<Scalars['Int']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  size?: Maybe<Scalars['Float']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type BackupsList = {
  __typename?: 'BackupsList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Backup>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type Build = Model & {
  __typename?: 'Build';
  commit_author: Scalars['String']['output'];
  commit_sha?: Maybe<Scalars['String']['output']>;
  commit_time: Scalars['Date']['output'];
  finish_date?: Maybe<Scalars['Date']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  logs?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  queued_date?: Maybe<Scalars['Date']['output']>;
  start_date?: Maybe<Scalars['Date']['output']>;
  status: BuildStatus;
  vendor_id?: Maybe<Scalars['Int']['output']>;
};

/** Build configuration for the environment */
export type BuildConfiguration = {
  __typename?: 'BuildConfiguration';
  /** Build type */
  buildType: Scalars['String']['output'];
  /** Node.js build environment variables */
  nodeBuildDockerEnv: Scalars['String']['output'];
  /** Node.js version */
  nodeJSVersion: Scalars['String']['output'];
  /** npm token */
  npmToken?: Maybe<Scalars['String']['output']>;
};

export type BuildList = ModelList & {
  __typename?: 'BuildList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Build>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export enum BuildStatus {
  Failed = 'FAILED',
  Queued = 'QUEUED',
  Running = 'RUNNING',
  Success = 'SUCCESS'
}

export type CsrDecoded = {
  __typename?: 'CSRDecoded';
  altNames?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  commonName?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  emailAddress?: Maybe<Scalars['String']['output']>;
  locality?: Maybe<Scalars['String']['output']>;
  organization?: Maybe<Scalars['String']['output']>;
  organizationUnit?: Maybe<Scalars['String']['output']>;
  state?: Maybe<Scalars['String']['output']>;
};

export type CsrInfo = {
  altNames?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  commonName: Scalars['String']['input'];
  country: Scalars['String']['input'];
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  locality: Scalars['String']['input'];
  organization: Scalars['String']['input'];
  organizationUnit?: InputMaybe<Scalars['String']['input']>;
  state: Scalars['String']['input'];
};

export type CancelInvitationInput = {
  invitationId?: InputMaybe<Scalars['Int']['input']>;
};

export type CancelInvitationPayload = {
  __typename?: 'CancelInvitationPayload';
  invitation?: Maybe<Invitation>;
};

/** Variables for the Cancel WP-CLI Command mutation */
export type CancelWpcliCommandInput = {
  /** The unique ID for the running command */
  guid?: InputMaybe<Scalars['String']['input']>;
};

/** Response from the Cancel WP-CLI Command mutation */
export type CancelWpcliCommandPayload = {
  __typename?: 'CancelWPCLICommandPayload';
  /** The command that was cancelled */
  command?: Maybe<WpcliCommand>;
};

export type Certificate = {
  __typename?: 'Certificate';
  active?: Maybe<Scalars['Boolean']['output']>;
  beginsTimestamp?: Maybe<Scalars['String']['output']>;
  certificateId?: Maybe<Scalars['Int']['output']>;
  /** Domain name. Ex: www.example.com */
  commonName?: Maybe<Scalars['String']['output']>;
  created?: Maybe<Scalars['String']['output']>;
  /** OpenSSL generated CSR string */
  csr?: Maybe<Scalars['String']['output']>;
  csrDecoded?: Maybe<CsrDecoded>;
  expiresTimestamp?: Maybe<Scalars['String']['output']>;
  hasCertificate?: Maybe<Scalars['Boolean']['output']>;
  issuer?: Maybe<CertificateIssuer>;
  /** Alternative names */
  san?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  valid?: Maybe<Scalars['Boolean']['output']>;
};

export type CertificateIssuer = {
  __typename?: 'CertificateIssuer';
  commonName?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  organization?: Maybe<Scalars['String']['output']>;
};

export type CertificateList = {
  __typename?: 'CertificateList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Certificate>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type CodebaseInfo = {
  __typename?: 'CodebaseInfo';
  plugins: CodebasePlugins;
};

export type CodebasePlugins = {
  __typename?: 'CodebasePlugins';
  pullRequests: Array<CodebasePullRequest>;
  tasks: Array<CodebaseTask>;
  vulnerabilities: Array<CodebaseVulnerability>;
};

export type CodebasePullRequest = {
  __typename?: 'CodebasePullRequest';
  link: Scalars['String']['output'];
  modulePath: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type CodebaseTask = {
  __typename?: 'CodebaseTask';
  dateUpdated: Scalars['String']['output'];
  failureReason: Scalars['String']['output'];
  modulePath: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

/** Variables for the CodebaseUpdatePlugin mutation */
export type CodebaseUpdatePluginInput = {
  /** The unique ID of the Application */
  appId: Scalars['Int']['input'];
  /** The download link for the new plugin version */
  download?: InputMaybe<Scalars['String']['input']>;
  /** The unique ID of the Environment */
  environmentId: Scalars['Int']['input'];
  /** The location of the plugin in the codebase */
  location?: InputMaybe<Scalars['String']['input']>;
  /** The marketplace the plugin belongs too */
  marketplace?: InputMaybe<Scalars['String']['input']>;
  /** The name of the plugin */
  name?: InputMaybe<Scalars['String']['input']>;
  /** The plugin slug */
  slug: Scalars['String']['input'];
  /** The new version to update the plugin */
  version?: InputMaybe<Scalars['String']['input']>;
  /** The number of active vulns on the plugin */
  vulnCount?: InputMaybe<Scalars['Int']['input']>;
};

export type CodebaseUpdatePluginResult = {
  __typename?: 'CodebaseUpdatePluginResult';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type CodebaseVulnerability = {
  __typename?: 'CodebaseVulnerability';
  link: Scalars['String']['output'];
  modulePath: Scalars['String']['output'];
  severity: Scalars['String']['output'];
  severityScore?: Maybe<Scalars['String']['output']>;
};

export type CreateCsrInput = {
  clientId: Scalars['Int']['input'];
  csr: CsrInfo;
  domainName?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCsrPayload = {
  __typename?: 'CreateCSRPayload';
  certificateId?: Maybe<Scalars['Int']['output']>;
};

export type CreateInvitationInput = {
  emailAddresses: Array<InputMaybe<Scalars['String']['input']>>;
  grantedPermissions: InvitationPermissionsInput;
  organizationId: Scalars['Int']['input'];
};

export type CreateInvitationPayload = {
  __typename?: 'CreateInvitationPayload';
  invitations?: Maybe<Array<Maybe<Invitation>>>;
};

export type CreateUserInput = {
  githubUsername: Scalars['String']['input'];
  isVIP?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateUserPayload = {
  __typename?: 'CreateUserPayload';
  user?: Maybe<User>;
};

export type DbBackupCopy = Model & {
  __typename?: 'DBBackupCopy';
  config?: Maybe<DbBackupCopyConfig>;
  filePath: Scalars['String']['output'];
  /** id is not implemented by DBBackupCopy as it does not have an integer id */
  id?: Maybe<Scalars['Int']['output']>;
};

export type DbBackupCopyConfig = {
  __typename?: 'DBBackupCopyConfig';
  backupLabel: Scalars['String']['output'];
  networkSiteId?: Maybe<Scalars['Int']['output']>;
  siteId: Scalars['Int']['output'];
  tables: Array<Scalars['String']['output']>;
  userId?: Maybe<Scalars['String']['output']>;
};

export type DbBackupCopyList = ModelList & {
  __typename?: 'DBBackupCopyList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes: Array<DbBackupCopy>;
  total: Scalars['Int']['output'];
};

export type DbPartitioningDataset = {
  __typename?: 'DBPartitioningDataset';
  displayName?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type DebugPageCacheInput = {
  appId: Scalars['Int']['input'];
  environmentId: Scalars['Int']['input'];
  pop?: InputMaybe<Scalars['String']['input']>;
  requestHeaders?: InputMaybe<Array<RequestHeader>>;
  requestMethod?: InputMaybe<Scalars['String']['input']>;
  url: Scalars['String']['input'];
};

export type DebugPageCacheInsight = {
  __typename?: 'DebugPageCacheInsight';
  category: Scalars['String']['output'];
  final: Scalars['Boolean']['output'];
  html: Scalars['String']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type DebugPageCachePayload = {
  __typename?: 'DebugPageCachePayload';
  edge?: Maybe<ServerResponse>;
  insights?: Maybe<Array<DebugPageCacheInsight>>;
  origin?: Maybe<ServerResponse>;
  success: Scalars['Boolean']['output'];
  url: Scalars['String']['output'];
};

export type DecodeCsrInput = {
  csr: Scalars['String']['input'];
};

export type DeleteCertificateInput = {
  certificateId: Scalars['Int']['input'];
  domainName: Scalars['String']['input'];
};

export type DeleteCertificatePayload = {
  __typename?: 'DeleteCertificatePayload';
  deleted?: Maybe<Scalars['Boolean']['output']>;
};

export type DeleteNotificationRecipientInput = {
  notificationRecipientId: Scalars['Int']['input'];
  organizationId: Scalars['Int']['input'];
};

export type DeleteNotificationRecipientPayload = {
  __typename?: 'DeleteNotificationRecipientPayload';
  deleted?: Maybe<Scalars['Boolean']['output']>;
};

export type DeleteNotificationSubscriptionInput = {
  applicationId: Scalars['Int']['input'];
  environmentId: Scalars['Int']['input'];
  notificationRecipientId: Scalars['Int']['input'];
  notificationSubscriptionId: Scalars['Int']['input'];
};

export type DeleteNotificationSubscriptionPayload = {
  __typename?: 'DeleteNotificationSubscriptionPayload';
  deleted?: Maybe<Scalars['Boolean']['output']>;
};

export type Deploy = {
  __typename?: 'Deploy';
  branch?: Maybe<Scalars['String']['output']>;
  commits?: Maybe<GitCommitList>;
  deployed_at?: Maybe<Scalars['String']['output']>;
  deployer_api_user_id?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  repo?: Maybe<Scalars['String']['output']>;
};


export type DeployCommitsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type DeployList = {
  __typename?: 'DeployList';
  edges?: Maybe<Array<Maybe<Deploy>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Deploy>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type Deployment = Model & {
  __typename?: 'Deployment';
  branch: Scalars['String']['output'];
  build?: Maybe<Build>;
  cancelledAt?: Maybe<Scalars['Date']['output']>;
  commit_author?: Maybe<Scalars['String']['output']>;
  commit_description?: Maybe<Scalars['String']['output']>;
  commit_sha: Scalars['String']['output'];
  commit_time?: Maybe<Scalars['Date']['output']>;
  createdAt?: Maybe<Scalars['Date']['output']>;
  deployment_finished_at?: Maybe<Scalars['Date']['output']>;
  deployment_status: Scalars['String']['output'];
  deployment_triggered_at?: Maybe<Scalars['Date']['output']>;
  id: Scalars['Int']['output'];
  inProgress?: Maybe<Scalars['Boolean']['output']>;
  initiatedBy?: Maybe<User>;
  isAvailableForRollback?: Maybe<Scalars['Boolean']['output']>;
  isError?: Maybe<Scalars['Boolean']['output']>;
  isLatest?: Maybe<Scalars['Boolean']['output']>;
  postDeployActionsJob?: Maybe<Scalars['String']['output']>;
  repo: Scalars['String']['output'];
  steps?: Maybe<Array<Maybe<DeploymentStep>>>;
};

export type DeploymentList = ModelList & {
  __typename?: 'DeploymentList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Deployment>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type DeploymentStep = {
  __typename?: 'DeploymentStep';
  finishDate?: Maybe<Scalars['Date']['output']>;
  inProgress: Scalars['Boolean']['output'];
  isError: Scalars['Boolean']['output'];
  isLogsAvailableForAppType?: Maybe<Scalars['Boolean']['output']>;
  logs?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  logsExpireAt?: Maybe<Scalars['Date']['output']>;
  startDate?: Maybe<Scalars['Date']['output']>;
  status: DeploymentStepStatus;
  step: Scalars['String']['output'];
};

export enum DeploymentStepStatus {
  BuildError = 'BuildError',
  BuildFinished = 'BuildFinished',
  Building = 'Building',
  Cancelled = 'Cancelled',
  Deploying = 'Deploying',
  Error = 'Error',
  Finished = 'Finished',
  Pending = 'Pending',
  Running = 'Running',
  Waiting = 'Waiting'
}

/** A domain for an environment */
export type Domain = {
  __typename?: 'Domain';
  /** Is the domain currently active? */
  active?: Maybe<Scalars['Boolean']['output']>;
  /** The active certificate of the domain */
  certificate?: Maybe<Certificate>;
  /** The matching certificates of the domain */
  certificates?: Maybe<CertificateList>;
  /** The date the domain was added to the system */
  createdAt?: Maybe<Scalars['String']['output']>;
  /** What is the IP of the domain and does it point to VIP? */
  dns?: Maybe<DomainDnsRecord>;
  /** The environment this domain belongs to */
  environment?: Maybe<AppEnvironment>;
  /** Does this domain have a valid TLS certificate? (Note: SSL is a misnomer there; we are using TLS certificates.) */
  hasSSL?: Maybe<Scalars['Boolean']['output']>;
  /** The unique ID for the domain */
  id?: Maybe<Scalars['Int']['output']>;
  /** Is this a default domain? (*.go-vip.co / *.go-vip.net) */
  isDefault?: Maybe<Scalars['Boolean']['output']>;
  /** Is the domain using a Let's Encrypt certificate */
  isLetsEncrypt?: Maybe<Scalars['Boolean']['output']>;
  /** Is this the primary domain for the environment? */
  isPrimary?: Maybe<Scalars['Boolean']['output']>;
  /** What are the issues that may block LE provisioning for this domain? */
  letsEncryptCompatibility?: Maybe<Array<Maybe<DomainLetsEncryptCompatibility>>>;
  /** What is the status of LE provisioning? */
  letsEncryptStatus?: Maybe<Array<Maybe<DomainLetsEncryptStatus>>>;
  /** The domain name (i.e. something like example.com or sub.example.com) */
  name: Scalars['String']['output'];
  /** The wildcard value for the current domain */
  wildcard?: Maybe<Scalars['String']['output']>;
};


/** A domain for an environment */
export type DomainCertificatesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type DomainDnsRecord = {
  __typename?: 'DomainDNSRecord';
  hasVIPHeaders?: Maybe<Scalars['Boolean']['output']>;
  ip?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  isVIP?: Maybe<Scalars['Boolean']['output']>;
};

export type DomainLetsEncryptCompatibility = {
  __typename?: 'DomainLetsEncryptCompatibility';
  actionable?: Maybe<Scalars['String']['output']>;
  code?: Maybe<Scalars['String']['output']>;
  domain?: Maybe<Scalars['String']['output']>;
  explanation?: Maybe<Scalars['String']['output']>;
  isDNSIssue?: Maybe<Scalars['Boolean']['output']>;
  isFatal?: Maybe<Scalars['Boolean']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type DomainLetsEncryptStatus = {
  __typename?: 'DomainLetsEncryptStatus';
  broken?: Maybe<Scalars['Boolean']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  expirationDate?: Maybe<Scalars['String']['output']>;
  failCount?: Maybe<Scalars['Int']['output']>;
  lastErrorDateTime?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  retryDate?: Maybe<Scalars['String']['output']>;
};

export type DomainList = {
  __typename?: 'DomainList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Domain>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

/** Customer-provided environment variable / constant */
export type EnvironmentVariable = {
  __typename?: 'EnvironmentVariable';
  /** Environment variable name */
  name: Scalars['String']['output'];
  /** Environment variable value */
  value?: Maybe<Scalars['String']['output']>;
};

export type EnvironmentVariableInput = {
  /** The unique ID of the Application */
  applicationId: Scalars['Int']['input'];
  /** The unique ID of the environment */
  environmentId: Scalars['Int']['input'];
  /** Environment variable name (must consist of uppercase letters, numbers, and underscore */
  name: Scalars['String']['input'];
  /** Environment variable value */
  value: Scalars['String']['input'];
};

/** Customer-provided environment variables / constants */
export type EnvironmentVariablesList = {
  __typename?: 'EnvironmentVariablesList';
  /** The environment variables for this environment */
  nodes?: Maybe<Array<Maybe<EnvironmentVariable>>>;
  /** The total number of environment variables for this environment */
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type EnvironmentVariablesPayload = {
  __typename?: 'EnvironmentVariablesPayload';
  environmentVariables?: Maybe<EnvironmentVariablesList>;
};

export type Feature = Model & {
  __typename?: 'Feature';
  active?: Maybe<Scalars['Boolean']['output']>;
  appId?: Maybe<Scalars['Int']['output']>;
  context?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type GitActor = {
  __typename?: 'GitActor';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GitHubUser>;
};


export type GitActorAvatarUrlArgs = {
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type GitCommit = {
  __typename?: 'GitCommit';
  abbreviatedOid?: Maybe<Scalars['String']['output']>;
  additions?: Maybe<Scalars['Int']['output']>;
  author?: Maybe<GitActor>;
  authoredDate?: Maybe<Scalars['String']['output']>;
  committedDate?: Maybe<Scalars['String']['output']>;
  deletions?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  messageBody?: Maybe<Scalars['String']['output']>;
  messageBodyHTML?: Maybe<Scalars['String']['output']>;
  messageHeadline?: Maybe<Scalars['String']['output']>;
  messageHeadlineHTML?: Maybe<Scalars['String']['output']>;
  oid?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type GitCommitList = {
  __typename?: 'GitCommitList';
  edges?: Maybe<Array<Maybe<GitCommit>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<GitCommit>>>;
};

export type GitHubComment = {
  __typename?: 'GitHubComment';
  body?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  issueUrl?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GitHubUser>;
};

export type GitHubPullRequest = Model & {
  __typename?: 'GitHubPullRequest';
  assignee?: Maybe<GitHubUser>;
  assignees?: Maybe<Array<Maybe<GitHubUser>>>;
  body?: Maybe<Scalars['String']['output']>;
  closedAt?: Maybe<Scalars['String']['output']>;
  comments?: Maybe<Scalars['Int']['output']>;
  commentsUrl?: Maybe<Scalars['String']['output']>;
  commitsUrl?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  eventsUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  initialCommit?: Maybe<Scalars['String']['output']>;
  labels?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  labelsUrl?: Maybe<Scalars['String']['output']>;
  locked?: Maybe<Scalars['Boolean']['output']>;
  number?: Maybe<Scalars['Int']['output']>;
  repositoryUrl?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  totalCommits?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GitHubUser>;
  vipMeta?: Maybe<VipprMeta>;
};

export type GitHubPullRequestList = ModelList & {
  __typename?: 'GitHubPullRequestList';
  edges?: Maybe<Array<Maybe<GitHubPullRequest>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<GitHubPullRequest>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type GitHubPullRequestReviewComment = {
  __typename?: 'GitHubPullRequestReviewComment';
  body?: Maybe<Scalars['String']['output']>;
  commitId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  diffHunk?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  originalCommitId?: Maybe<Scalars['String']['output']>;
  originalPosition?: Maybe<Scalars['Int']['output']>;
  path?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  pullRequestUrl?: Maybe<Scalars['String']['output']>;
  pullRequest_review_id?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GitHubUser>;
};

export type GitHubReview = {
  __typename?: 'GitHubReview';
  body?: Maybe<Scalars['String']['output']>;
  commitId?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  pullRequestUrl?: Maybe<Scalars['String']['output']>;
  state?: Maybe<Scalars['String']['output']>;
  submittedAt?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GitHubUser>;
};

export type GitHubUser = {
  __typename?: 'GitHubUser';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  eventsUrl?: Maybe<Scalars['String']['output']>;
  followersUrl?: Maybe<Scalars['String']['output']>;
  followingUrl?: Maybe<Scalars['String']['output']>;
  gistsUrl?: Maybe<Scalars['String']['output']>;
  gravatarId?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  login?: Maybe<Scalars['String']['output']>;
  organizationsUrl?: Maybe<Scalars['String']['output']>;
  receivedEventsUrl?: Maybe<Scalars['String']['output']>;
  reposUrl?: Maybe<Scalars['String']['output']>;
  siteAdmin?: Maybe<Scalars['Boolean']['output']>;
  starredUrl?: Maybe<Scalars['String']['output']>;
  subscriptionsUrl?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type GitRepository = {
  __typename?: 'GitRepository';
  fullName?: Maybe<Scalars['String']['output']>;
  htmlUrl?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organization?: Maybe<Scalars['String']['output']>;
  platform?: Maybe<Scalars['String']['output']>;
};

export type Invitation = Model & {
  __typename?: 'Invitation';
  acceptedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  emailAddress?: Maybe<Scalars['String']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  grantedPermissions?: Maybe<InvitationPermissions>;
  id?: Maybe<Scalars['Int']['output']>;
  invitingUser?: Maybe<User>;
  isCancelable?: Maybe<Scalars['Boolean']['output']>;
  isResendable?: Maybe<Scalars['Boolean']['output']>;
  organization?: Maybe<Organization>;
  status?: Maybe<Scalars['String']['output']>;
};

export type InvitationList = {
  __typename?: 'InvitationList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Invitation>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type InvitationPermissions = {
  __typename?: 'InvitationPermissions';
  applicationRoles?: Maybe<Array<Maybe<InvitationPermissionsApplicationRole>>>;
  organizationRoleId?: Maybe<Scalars['String']['output']>;
};

export type InvitationPermissionsApplicationRole = {
  __typename?: 'InvitationPermissionsApplicationRole';
  app?: Maybe<App>;
  appId?: Maybe<Scalars['Int']['output']>;
  role?: Maybe<ApplicationRole>;
  roleId?: Maybe<ApplicationRoleId>;
};

export type InvitationPermissionsApplicationRoleInput = {
  appId?: InputMaybe<Scalars['Int']['input']>;
  roleId?: InputMaybe<ApplicationRoleId>;
};

export type InvitationPermissionsInput = {
  applicationRoles?: InputMaybe<Array<InputMaybe<InvitationPermissionsApplicationRoleInput>>>;
  organizationRoleId?: InputMaybe<OrgRoleId>;
};

export type Job = JobInterface & {
  __typename?: 'Job';
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inProgressLock?: Maybe<Scalars['Boolean']['output']>;
  metadata?: Maybe<Array<Maybe<JobMetadata>>>;
  progress?: Maybe<JobProgress>;
  type?: Maybe<Scalars['String']['output']>;
};

export type JobInterface = {
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inProgressLock?: Maybe<Scalars['Boolean']['output']>;
  metadata?: Maybe<Array<Maybe<JobMetadata>>>;
  progress?: Maybe<JobProgress>;
  type?: Maybe<Scalars['String']['output']>;
};

export type JobMetadata = {
  __typename?: 'JobMetadata';
  name?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

export type JobProgress = {
  __typename?: 'JobProgress';
  status?: Maybe<Scalars['String']['output']>;
  steps?: Maybe<Array<Maybe<JobProgressStep>>>;
};

export type JobProgressStep = {
  __typename?: 'JobProgressStep';
  id?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  step?: Maybe<Scalars['String']['output']>;
};

export type MediaExport = {
  __typename?: 'MediaExport';
  createdAt?: Maybe<Scalars['String']['output']>;
  environmentId?: Maybe<Scalars['Int']['output']>;
  error?: Maybe<MediaExportError>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  filesProcessed?: Maybe<Scalars['Int']['output']>;
  filesTotal?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  subsite?: Maybe<WpSite>;
  totalSizeInBytes?: Maybe<Scalars['Float']['output']>;
  user?: Maybe<WpcliCommandUser>;
};

export type MediaExportError = {
  __typename?: 'MediaExportError';
  globalErrors?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  hasFileErrors?: Maybe<Scalars['Boolean']['output']>;
};

export type MediaExportsList = {
  __typename?: 'MediaExportsList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<MediaExport>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type MetricMeasurement = {
  __typename?: 'MetricMeasurement';
  baseline?: Maybe<Scalars['Float']['output']>;
  timestamp: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type Model = {
  id?: Maybe<Scalars['Int']['output']>;
};

export type ModelList = {
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Model>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  abortMediaImport?: Maybe<AppEnvironmentAbortMediaImportPayload>;
  /** Accept an invitation to an organization */
  acceptInvitation?: Maybe<AcceptInvitationPayload>;
  activateCertificate?: Maybe<ActivateCertificatePayload>;
  /** Activate a Let's Encrypt TLS certificate for a domain */
  activateLetsEncryptOnDomainForAppEnvironment?: Maybe<AppEnvironmentActivateLetsEncryptOnDomainPayload>;
  addBasicAuth?: Maybe<AppEnvironmentBasicAuthPayload>;
  addCertificate?: Maybe<AddCertificatePayload>;
  /** Add a domain to an environment */
  addDomainToAppEnvironment?: Maybe<AppEnvironmentAddDomainPayload>;
  /** Environment variables */
  addEnvironmentVariable?: Maybe<EnvironmentVariablesPayload>;
  /** Notifications */
  addNotificationRecipient?: Maybe<AddNotificationRecipientPayload>;
  addNotificationSubscription?: Maybe<AddNotificationSubscriptionPayload>;
  /** Request stats */
  addRequestStats?: Maybe<AppEnvironmentAddRequestStatsPayload>;
  /** Cancel an invitation to an organization */
  cancelInvitation?: Maybe<CancelInvitationPayload>;
  /** Stop a running WP-CLI command */
  cancelWPCLICommand?: Maybe<CancelWpcliCommandPayload>;
  /** TLS Management */
  createCSR?: Maybe<CreateCsrPayload>;
  /** Invite a user to an organization */
  createInvitation?: Maybe<CreateInvitationPayload>;
  createUser?: Maybe<CreateUserPayload>;
  /** Remove a domain from an environment */
  deactivateDomainOnAppEnvironment?: Maybe<AppEnvironmentDeactivateDomainPayload>;
  /** Debug page cache object */
  debugPageCache?: Maybe<DebugPageCachePayload>;
  decodeCSR?: Maybe<CsrDecoded>;
  deleteBackupShippingConfig?: Maybe<AppEnvironmentBackupShippingPayload>;
  deleteBasicAuth?: Maybe<AppEnvironmentBasicAuthPayload>;
  deleteCertificate?: Maybe<DeleteCertificatePayload>;
  deleteEnvironmentVariable?: Maybe<EnvironmentVariablesPayload>;
  /** Delete one or more IPs from the IP Allow List for an environment */
  deleteIPAllowList?: Maybe<AppEnvironmentIpAllowListPayload>;
  deleteLogShippingConfig?: Maybe<AppEnvironmentLogShippingPayload>;
  deleteNotificationRecipient?: Maybe<DeleteNotificationRecipientPayload>;
  deleteNotificationSubscription?: Maybe<DeleteNotificationSubscriptionPayload>;
  disableBackupShipping?: Maybe<AppEnvironmentBackupShippingPayload>;
  disableFeature?: Maybe<AppFeaturePayload>;
  disableLogShipping?: Maybe<AppEnvironmentLogShippingPayload>;
  editBasicAuth?: Maybe<AppEnvironmentBasicAuthPayload>;
  enableBackupShipping?: Maybe<AppEnvironmentBackupShippingPayload>;
  enableFeature?: Maybe<AppFeaturePayload>;
  enableLaunchMode?: Maybe<AppEnvironmentEnableLaunchModePayload>;
  enableLogShipping?: Maybe<AppEnvironmentLogShippingPayload>;
  /** Generate a presigned download URL to a previously copied database backup */
  generateDBBackupCopyUrl?: Maybe<AppEnvironmentGenerateDbBackupCopyUrlPayload>;
  generateMediaExportSignedUrl?: Maybe<AppEnvironmentGenerateMediaExportSignedUrlPayload>;
  generateUserToken?: Maybe<UserTokenGenerationPayload>;
  launchApplication?: Maybe<AppEnvironmentLaunchedPayload>;
  /** Purge page cache object(s) */
  purgePageCache?: Maybe<PurgePageCachePayload>;
  /** Remove a user from an organization (removes all roles and applications permissions) */
  removeUserFromOrganization?: Maybe<RemoveUserFromOrganizationPayload>;
  /** Replace all IPs in the IP Allow List for an environment */
  replaceIPAllowList?: Maybe<AppEnvironmentIpAllowListPayload>;
  /** Resend an invitation to an organization */
  resendInvitation?: Maybe<ResendInvitationPayload>;
  /** Rollback */
  rollback?: Maybe<RollbackPayload>;
  sendTestNotification?: Maybe<SendTestNotificationPayload>;
  setUserApplicationRoles?: Maybe<SetUserApplicationRolesPayload>;
  setUserOrganizationRole?: Maybe<UpdateUserOrganizationRolePayload>;
  startDBBackupCopy?: Maybe<AppEnvironmentStartDbBackupCopyPayload>;
  startImport?: Maybe<AppEnvironmentImportPayload>;
  /** Media Exports */
  startMediaExport?: Maybe<StartMediaExportPayload>;
  /** Import Media into your Production Environment */
  startMediaImport?: Maybe<AppEnvironmentMediaImportPayload>;
  /** Switch the primary domain for an environment */
  switchEnvironmentPrimaryDomain?: Maybe<AppEnvironmentPrimaryDomainSwitchPayload>;
  syncEnvironment?: Maybe<AppEnvironmentSyncPayload>;
  toggleVIPStatus?: Maybe<ToggleUserVipStatusPayload>;
  /** Execute a WP-CLI command on an environment */
  triggerWPCLICommandOnAppEnvironment?: Maybe<AppEnvironmentTriggerWpcliCommandPayload>;
  updateBackupShippingConfig?: Maybe<AppEnvironmentBackupShippingPayload>;
  updateCertificate?: Maybe<UpdateCertificatePayload>;
  /** Network Sites */
  updateEnvironmentSubsiteDomain?: Maybe<AppEnvironmentUpdateSubsiteDomainPayload>;
  updateEnvironmentVariable?: Maybe<EnvironmentVariablesPayload>;
  /** HSTS Settings */
  updateHSTSSettings?: Maybe<AppEnvironmentHstsSettingsPayload>;
  /** Add one or more IPs to the IP Allow List for an environment */
  updateIPAllowList?: Maybe<AppEnvironmentIpAllowListPayload>;
  updateLogShippingConfig?: Maybe<AppEnvironmentLogShippingPayload>;
  updateNotificationRecipient?: Maybe<UpdateNotificationRecipientPayload>;
  updateNotificationSubscription?: Maybe<UpdateNotificationSubscriptionPayload>;
  /** Plugin Update */
  updatePlugin?: Maybe<CodebaseUpdatePluginResult>;
  /** Software Settings */
  updateSoftwareSettings?: Maybe<AppEnvironmentSoftwareSettings>;
  updateWPSiteLaunchStatus?: Maybe<WpSiteLaunchStatusPayload>;
  validateLogShippingConfig?: Maybe<AppEnvironmentLogShippingValidationPayload>;
};


export type MutationAbortMediaImportArgs = {
  input?: InputMaybe<AppEnvironmentAbortMediaImportInput>;
};


export type MutationAcceptInvitationArgs = {
  input?: InputMaybe<AcceptInvitationInput>;
};


export type MutationActivateCertificateArgs = {
  input?: InputMaybe<ActivateCertificateInput>;
};


export type MutationActivateLetsEncryptOnDomainForAppEnvironmentArgs = {
  input?: InputMaybe<AppEnvironmentActivateLetsEncryptOnDomainInput>;
};


export type MutationAddBasicAuthArgs = {
  input?: InputMaybe<AppEnvironmentBasicAuthInput>;
};


export type MutationAddCertificateArgs = {
  input?: InputMaybe<AddCertificateInput>;
};


export type MutationAddDomainToAppEnvironmentArgs = {
  input?: InputMaybe<AppEnvironmentAddDomainInput>;
};


export type MutationAddEnvironmentVariableArgs = {
  input?: InputMaybe<EnvironmentVariableInput>;
};


export type MutationAddNotificationRecipientArgs = {
  input?: InputMaybe<AddNotificationRecipientInput>;
};


export type MutationAddNotificationSubscriptionArgs = {
  input?: InputMaybe<AddNotificationSubscriptionInput>;
};


export type MutationAddRequestStatsArgs = {
  input?: InputMaybe<AppEnvironmentAddRequestStatsInput>;
};


export type MutationCancelInvitationArgs = {
  input?: InputMaybe<CancelInvitationInput>;
};


export type MutationCancelWpcliCommandArgs = {
  input?: InputMaybe<CancelWpcliCommandInput>;
};


export type MutationCreateCsrArgs = {
  input?: InputMaybe<CreateCsrInput>;
};


export type MutationCreateInvitationArgs = {
  input?: InputMaybe<CreateInvitationInput>;
};


export type MutationCreateUserArgs = {
  input?: InputMaybe<CreateUserInput>;
};


export type MutationDeactivateDomainOnAppEnvironmentArgs = {
  input?: InputMaybe<AppEnvironmentDeactivateDomainInput>;
};


export type MutationDebugPageCacheArgs = {
  input?: InputMaybe<DebugPageCacheInput>;
};


export type MutationDecodeCsrArgs = {
  input?: InputMaybe<DecodeCsrInput>;
};


export type MutationDeleteBackupShippingConfigArgs = {
  input?: InputMaybe<AppEnvironmentBackupShippingInput>;
};


export type MutationDeleteBasicAuthArgs = {
  input?: InputMaybe<AppEnvironmentBasicAuthDeleteInput>;
};


export type MutationDeleteCertificateArgs = {
  input?: InputMaybe<DeleteCertificateInput>;
};


export type MutationDeleteEnvironmentVariableArgs = {
  input?: InputMaybe<EnvironmentVariableInput>;
};


export type MutationDeleteIpAllowListArgs = {
  input?: InputMaybe<AppEnvironmentIpAllowListInput>;
};


export type MutationDeleteLogShippingConfigArgs = {
  input?: InputMaybe<AppEnvironmentLogShippingInput>;
};


export type MutationDeleteNotificationRecipientArgs = {
  input?: InputMaybe<DeleteNotificationRecipientInput>;
};


export type MutationDeleteNotificationSubscriptionArgs = {
  input?: InputMaybe<DeleteNotificationSubscriptionInput>;
};


export type MutationDisableBackupShippingArgs = {
  input?: InputMaybe<AppEnvironmentBackupShippingInput>;
};


export type MutationDisableFeatureArgs = {
  input?: InputMaybe<AppFeatureInput>;
};


export type MutationDisableLogShippingArgs = {
  input?: InputMaybe<AppEnvironmentLogShippingInput>;
};


export type MutationEditBasicAuthArgs = {
  input?: InputMaybe<AppEnvironmentBasicAuthInput>;
};


export type MutationEnableBackupShippingArgs = {
  input?: InputMaybe<AppEnvironmentBackupShippingInput>;
};


export type MutationEnableFeatureArgs = {
  input?: InputMaybe<AppFeatureInput>;
};


export type MutationEnableLaunchModeArgs = {
  input?: InputMaybe<AppEnvironmentEnableLaunchModeInput>;
};


export type MutationEnableLogShippingArgs = {
  input?: InputMaybe<AppEnvironmentLogShippingInput>;
};


export type MutationGenerateDbBackupCopyUrlArgs = {
  input?: InputMaybe<AppEnvironmentGenerateDbBackupCopyUrlInput>;
};


export type MutationGenerateMediaExportSignedUrlArgs = {
  input?: InputMaybe<AppEnvironmentGenerateMediaExportSignedUrlInput>;
};


export type MutationGenerateUserTokenArgs = {
  input?: InputMaybe<UserTokenGenerationInput>;
};


export type MutationLaunchApplicationArgs = {
  input?: InputMaybe<AppEnvironmentLaunchedInput>;
};


export type MutationPurgePageCacheArgs = {
  input?: InputMaybe<PurgePageCacheInput>;
};


export type MutationRemoveUserFromOrganizationArgs = {
  input?: InputMaybe<RemoveUserFromOrganizationInput>;
};


export type MutationReplaceIpAllowListArgs = {
  input?: InputMaybe<AppEnvironmentIpAllowListInput>;
};


export type MutationResendInvitationArgs = {
  input?: InputMaybe<ResendInvitationInput>;
};


export type MutationRollbackArgs = {
  input?: InputMaybe<RollbackInput>;
};


export type MutationSendTestNotificationArgs = {
  input?: InputMaybe<SendTestNotificationInput>;
};


export type MutationSetUserApplicationRolesArgs = {
  input?: InputMaybe<SetUserApplicationRolesInput>;
};


export type MutationSetUserOrganizationRoleArgs = {
  input?: InputMaybe<UpdateUserOrganizationRoleInput>;
};


export type MutationStartDbBackupCopyArgs = {
  input?: InputMaybe<AppEnvironmentStartDbBackupCopyInput>;
};


export type MutationStartImportArgs = {
  input?: InputMaybe<AppEnvironmentImportInput>;
};


export type MutationStartMediaExportArgs = {
  input?: InputMaybe<StartMediaExportInput>;
};


export type MutationStartMediaImportArgs = {
  input?: InputMaybe<AppEnvironmentStartMediaImportInput>;
};


export type MutationSwitchEnvironmentPrimaryDomainArgs = {
  input?: InputMaybe<AppEnvironmentPrimaryDomainSwitchInput>;
};


export type MutationSyncEnvironmentArgs = {
  input?: InputMaybe<AppEnvironmentSyncInput>;
};


export type MutationToggleVipStatusArgs = {
  input?: InputMaybe<ToggleUserVipStatusInput>;
};


export type MutationTriggerWpcliCommandOnAppEnvironmentArgs = {
  input?: InputMaybe<AppEnvironmentTriggerWpcliCommandInput>;
};


export type MutationUpdateBackupShippingConfigArgs = {
  input?: InputMaybe<AppEnvironmentBackupShippingInput>;
};


export type MutationUpdateCertificateArgs = {
  input?: InputMaybe<UpdateCertificateInput>;
};


export type MutationUpdateEnvironmentSubsiteDomainArgs = {
  input?: InputMaybe<AppEnvironmentUpdateSubsiteDomainInput>;
};


export type MutationUpdateEnvironmentVariableArgs = {
  input?: InputMaybe<EnvironmentVariableInput>;
};


export type MutationUpdateHstsSettingsArgs = {
  input?: InputMaybe<AppEnvironmentHstsSettingsInput>;
};


export type MutationUpdateIpAllowListArgs = {
  input?: InputMaybe<AppEnvironmentIpAllowListInput>;
};


export type MutationUpdateLogShippingConfigArgs = {
  input?: InputMaybe<AppEnvironmentLogShippingInput>;
};


export type MutationUpdateNotificationRecipientArgs = {
  input?: InputMaybe<UpdateNotificationRecipientInput>;
};


export type MutationUpdateNotificationSubscriptionArgs = {
  input?: InputMaybe<UpdateNotificationSubscriptionInput>;
};


export type MutationUpdatePluginArgs = {
  input?: InputMaybe<CodebaseUpdatePluginInput>;
};


export type MutationUpdateSoftwareSettingsArgs = {
  input?: InputMaybe<AppEnvironmentSoftwareSettingsInput>;
};


export type MutationUpdateWpSiteLaunchStatusArgs = {
  input?: InputMaybe<WpSiteLaunchStatusInput>;
};


export type MutationValidateLogShippingConfigArgs = {
  input?: InputMaybe<AppEnvironmentLogShippingInput>;
};

export type NewDomain = {
  name: Scalars['String']['input'];
};

export type NotificationRecipient = {
  __typename?: 'NotificationRecipient';
  createdAt?: Maybe<Scalars['Date']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  meta?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organizationId: Scalars['Int']['output'];
  recipientType?: Maybe<NotificationRecipientType>;
  recipientValue?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['Date']['output']>;
};

export type NotificationRecipientList = {
  __typename?: 'NotificationRecipientList';
  nodes?: Maybe<Array<Maybe<NotificationRecipient>>>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export enum NotificationRecipientType {
  Email = 'EMAIL',
  Slack = 'SLACK',
  Webhook = 'WEBHOOK'
}

export type NotificationSubscription = {
  __typename?: 'NotificationSubscription';
  active?: Maybe<Scalars['Boolean']['output']>;
  createdAt?: Maybe<Scalars['Date']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  entityType?: Maybe<Scalars['String']['output']>;
  entityValue?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  meta?: Maybe<Scalars['String']['output']>;
  notificationRecipient?: Maybe<NotificationRecipient>;
  updatedAt?: Maybe<Scalars['Date']['output']>;
};

export type NotificationSubscriptionList = {
  __typename?: 'NotificationSubscriptionList';
  nodes?: Maybe<Array<Maybe<NotificationSubscription>>>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type OrgList = ModelList & {
  __typename?: 'OrgList';
  edges?: Maybe<Array<Maybe<Organization>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<Organization>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type OrgRole = {
  __typename?: 'OrgRole';
  extends?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export enum OrgRoleId {
  Admin = 'admin',
  Member = 'member',
  Viewer = 'viewer'
}

export type Organization = Model & {
  __typename?: 'Organization';
  apps?: Maybe<AppList>;
  contacts?: Maybe<OrganizationContacts>;
  events?: Maybe<AuditEventList>;
  id?: Maybe<Scalars['Int']['output']>;
  invitations?: Maybe<InvitationList>;
  name?: Maybe<Scalars['String']['output']>;
  notificationRecipients?: Maybe<NotificationRecipientList>;
  pageviews?: Maybe<Pageviews>;
  permissions?: Maybe<Array<Maybe<PermissionResult>>>;
  plan?: Maybe<OrganizationPlan>;
  serviceStatus?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
  supportPackage?: Maybe<Scalars['String']['output']>;
  users?: Maybe<UserList>;
};


export type OrganizationAppsArgs = {
  active?: InputMaybe<Scalars['String']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  matching?: InputMaybe<Scalars['String']['input']>;
};


export type OrganizationEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Scalars['String']['input']>;
};


export type OrganizationInvitationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  matching?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type OrganizationNotificationRecipientsArgs = {
  appId?: InputMaybe<Scalars['Int']['input']>;
};


export type OrganizationPermissionsArgs = {
  permissions?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type OrganizationUsersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  isVIP?: InputMaybe<Scalars['Boolean']['input']>;
};

export type OrganizationContacts = {
  __typename?: 'OrganizationContacts';
  accountOwners?: Maybe<SalesforceContactList>;
  supportContacts?: Maybe<SalesforceContactList>;
  technicalContacts?: Maybe<SalesforceContactList>;
  vipLaunchTAM?: Maybe<SalesforceContact>;
  vipRelationshipManager?: Maybe<SalesforceContact>;
  vipTechnicalAccountManager?: Maybe<SalesforceContact>;
};

export type OrganizationPlan = {
  __typename?: 'OrganizationPlan';
  addOns?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  codeReviewLevel?: Maybe<Scalars['String']['output']>;
  numberOfAllowedApplications?: Maybe<Scalars['Int']['output']>;
  planEndDate?: Maybe<Scalars['String']['output']>;
  planIncludedRequests?: Maybe<Scalars['Int']['output']>;
  planName?: Maybe<Scalars['String']['output']>;
  planStartDate?: Maybe<Scalars['String']['output']>;
  ticketSLA?: Maybe<Scalars['String']['output']>;
  uptimeSLA?: Maybe<Scalars['String']['output']>;
};

export type PageviewDetails = {
  __typename?: 'PageviewDetails';
  apiRequests?: Maybe<Scalars['Int']['output']>;
  appRequests?: Maybe<Scalars['Int']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  staticRequests?: Maybe<Scalars['Int']['output']>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type Pageviews = {
  __typename?: 'Pageviews';
  apiRequests?: Maybe<Scalars['BigInt']['output']>;
  appRequests?: Maybe<Scalars['BigInt']['output']>;
  details?: Maybe<Array<Maybe<PageviewDetails>>>;
  endDate?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  staticRequests?: Maybe<Scalars['BigInt']['output']>;
  total?: Maybe<Scalars['BigInt']['output']>;
};

export type PermissionResult = {
  __typename?: 'PermissionResult';
  isAllowed?: Maybe<Scalars['Boolean']['output']>;
  permission?: Maybe<Scalars['String']['output']>;
};

export type PrimaryDomainSwitchJob = JobInterface & {
  __typename?: 'PrimaryDomainSwitchJob';
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inProgressLock?: Maybe<Scalars['Boolean']['output']>;
  metadata?: Maybe<Array<Maybe<JobMetadata>>>;
  newDomain?: Maybe<Domain>;
  progress?: Maybe<JobProgress>;
  type?: Maybe<Scalars['String']['output']>;
};

export type PurgePageCacheInput = {
  appId: Scalars['Int']['input'];
  environmentId: Scalars['Int']['input'];
  urls: Array<Scalars['String']['input']>;
};

export type PurgePageCachePayload = {
  __typename?: 'PurgePageCachePayload';
  success: Scalars['Boolean']['output'];
  urls: Array<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  app?: Maybe<App>;
  apps?: Maybe<AppList>;
  certificate?: Maybe<Certificate>;
  dbBackupCopies?: Maybe<DbBackupCopyList>;
  domain?: Maybe<Domain>;
  domains?: Maybe<DomainList>;
  me?: Maybe<User>;
  organization?: Maybe<Organization>;
  organizations?: Maybe<OrgList>;
  repo?: Maybe<Repo>;
  user?: Maybe<User>;
  users?: Maybe<UserList>;
};


export type QueryAppArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAppsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  ids?: InputMaybe<Array<InputMaybe<Scalars['Int']['input']>>>;
  matching?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCertificateArgs = {
  certificateId?: InputMaybe<Scalars['Int']['input']>;
  clientId?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDbBackupCopiesArgs = {
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  fileNames?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryDomainArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  wildcards?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryOrganizationArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryOrganizationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  matching?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRepoArgs = {
  name?: InputMaybe<Scalars['String']['input']>;
};


export type QueryUserArgs = {
  githubUsername?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryUsersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  isVIP?: InputMaybe<Scalars['Boolean']['input']>;
  matching?: InputMaybe<Scalars['String']['input']>;
  organizationId?: InputMaybe<Scalars['Int']['input']>;
};

export type RemoveUserFromOrganizationInput = {
  organizationId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

export type RemoveUserFromOrganizationPayload = {
  __typename?: 'RemoveUserFromOrganizationPayload';
  user?: Maybe<User>;
};

export type Repo = Model & {
  __typename?: 'Repo';
  apps?: Maybe<AppList>;
  branch?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type RequestHeader = {
  name: Scalars['String']['input'];
  value: Scalars['String']['input'];
};

export type RequestStats = {
  __typename?: 'RequestStats';
  apiA8cCached?: Maybe<Scalars['BigInt']['output']>;
  apiA8cUncached?: Maybe<Scalars['BigInt']['output']>;
  apiCached?: Maybe<Scalars['BigInt']['output']>;
  apiUncached?: Maybe<Scalars['BigInt']['output']>;
  appA8cCached?: Maybe<Scalars['BigInt']['output']>;
  appA8cUncached?: Maybe<Scalars['BigInt']['output']>;
  appCached?: Maybe<Scalars['BigInt']['output']>;
  appUncached?: Maybe<Scalars['BigInt']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  environmentId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  staticA8cCached?: Maybe<Scalars['BigInt']['output']>;
  staticA8cUncached?: Maybe<Scalars['BigInt']['output']>;
  staticCached?: Maybe<Scalars['BigInt']['output']>;
  staticUncached?: Maybe<Scalars['BigInt']['output']>;
};

export type RequestStatsList = {
  __typename?: 'RequestStatsList';
  nodes?: Maybe<Array<Maybe<RequestStats>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type ResendInvitationInput = {
  invitationId?: InputMaybe<Scalars['Int']['input']>;
};

export type ResendInvitationPayload = {
  __typename?: 'ResendInvitationPayload';
  invitation?: Maybe<Invitation>;
};

export type ResponseHeader = {
  __typename?: 'ResponseHeader';
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type ReviewQueue = {
  __typename?: 'ReviewQueue';
  repos?: Maybe<Array<Maybe<Repo>>>;
};

export type RollbackInput = {
  appId?: InputMaybe<Scalars['Int']['input']>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
  toDeploymentId?: InputMaybe<Scalars['Int']['input']>;
};

export type RollbackPayload = {
  __typename?: 'RollbackPayload';
  newDeployment?: Maybe<Deployment>;
};

export type SalesforceContact = {
  __typename?: 'SalesforceContact';
  email?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type SalesforceContactList = {
  __typename?: 'SalesforceContactList';
  nodes?: Maybe<Array<Maybe<SalesforceContact>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type SendTestNotificationInput = {
  body?: InputMaybe<Scalars['String']['input']>;
  header?: InputMaybe<Scalars['String']['input']>;
  notificationRecipientId: Scalars['Int']['input'];
  organizationId: Scalars['Int']['input'];
};

export type SendTestNotificationPayload = {
  __typename?: 'SendTestNotificationPayload';
  sent?: Maybe<Scalars['Boolean']['output']>;
};

export type ServerResponse = {
  __typename?: 'ServerResponse';
  headers: Array<ResponseHeader>;
  statusCode: Scalars['Int']['output'];
};

export type SetUserApplicationRolesInput = {
  applicationRoles: Array<InputMaybe<UserApplicationRoleInput>>;
};

export type SetUserApplicationRolesPayload = {
  __typename?: 'SetUserApplicationRolesPayload';
  applicationRoles?: Maybe<Array<Maybe<UserApplicationRole>>>;
};

export type StartMediaExportConfigOptions = {
  regex?: InputMaybe<Scalars['String']['input']>;
  subsiteId?: InputMaybe<Scalars['Int']['input']>;
};

export type StartMediaExportInput = {
  appId?: InputMaybe<Scalars['Int']['input']>;
  config?: InputMaybe<StartMediaExportConfigOptions>;
  environmentId?: InputMaybe<Scalars['Int']['input']>;
};

export type StartMediaExportPayload = {
  __typename?: 'StartMediaExportPayload';
  mediaExport?: Maybe<MediaExport>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

export type ToggleUserVipStatusInput = {
  githubUsername: Scalars['String']['input'];
  isVIP?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ToggleUserVipStatusPayload = {
  __typename?: 'ToggleUserVIPStatusPayload';
  user?: Maybe<User>;
};

export type Token = Model & {
  __typename?: 'Token';
  active?: Maybe<Scalars['Boolean']['output']>;
  exp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type UpdateCertificateInput = {
  certificate: Scalars['String']['input'];
  certificateId: Scalars['Int']['input'];
  clientId: Scalars['Int']['input'];
  domainName?: InputMaybe<Scalars['String']['input']>;
  trustedCertificate?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCertificatePayload = {
  __typename?: 'UpdateCertificatePayload';
  certificate?: Maybe<Certificate>;
};

export type UpdateNotificationRecipientInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  meta?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  organizationId: Scalars['Int']['input'];
  recipientType?: InputMaybe<NotificationRecipientType>;
  recipientValue?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateNotificationRecipientPayload = {
  __typename?: 'UpdateNotificationRecipientPayload';
  notificationRecipient?: Maybe<NotificationRecipient>;
};

export type UpdateNotificationSubscriptionInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  applicationId: Scalars['Int']['input'];
  description: Scalars['String']['input'];
  environmentId: Scalars['Int']['input'];
  meta?: InputMaybe<Scalars['String']['input']>;
  notificationRecipientId: Scalars['Int']['input'];
  notificationSubscriptionId: Scalars['Int']['input'];
};

export type UpdateNotificationSubscriptionPayload = {
  __typename?: 'UpdateNotificationSubscriptionPayload';
  notificationSubscription?: Maybe<NotificationSubscription>;
};

export type UpdateUserOrganizationRoleInput = {
  organizationId: Scalars['Int']['input'];
  role?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['Int']['input'];
};

export type UpdateUserOrganizationRolePayload = {
  __typename?: 'UpdateUserOrganizationRolePayload';
  organizationRole?: Maybe<UserOrganizationRole>;
  user?: Maybe<User>;
};

export type User = Model & {
  __typename?: 'User';
  applicationRoles?: Maybe<UserApplicationRoleList>;
  auth0Id?: Maybe<Scalars['String']['output']>;
  displayName?: Maybe<Scalars['String']['output']>;
  emailAddress?: Maybe<Scalars['String']['output']>;
  githubUsername?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isVIP?: Maybe<Scalars['Boolean']['output']>;
  organizationRoles?: Maybe<UserOrganizationRoleList>;
  tokens?: Maybe<Array<Maybe<Token>>>;
  wpcomUsername?: Maybe<Scalars['String']['output']>;
};


export type UserApplicationRolesArgs = {
  appId?: InputMaybe<Scalars['Int']['input']>;
};

export type UserApplicationRole = Model & {
  __typename?: 'UserApplicationRole';
  app?: Maybe<App>;
  appId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  role?: Maybe<ApplicationRole>;
  roleId?: Maybe<ApplicationRoleId>;
  source?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type UserApplicationRoleInput = {
  appId: Scalars['Int']['input'];
  roleId?: InputMaybe<ApplicationRoleId>;
  userId: Scalars['Int']['input'];
};

export type UserApplicationRoleList = ModelList & {
  __typename?: 'UserApplicationRoleList';
  edges?: Maybe<Array<Maybe<UserApplicationRole>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<UserApplicationRole>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type UserList = ModelList & {
  __typename?: 'UserList';
  edges?: Maybe<Array<Maybe<User>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<User>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type UserOrganizationRole = Model & {
  __typename?: 'UserOrganizationRole';
  id?: Maybe<Scalars['Int']['output']>;
  organization?: Maybe<Organization>;
  organizationId?: Maybe<Scalars['Int']['output']>;
  role?: Maybe<OrgRole>;
  roleId?: Maybe<OrgRoleId>;
  source?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type UserOrganizationRoleList = ModelList & {
  __typename?: 'UserOrganizationRoleList';
  edges?: Maybe<Array<Maybe<UserOrganizationRole>>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<UserOrganizationRole>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type UserTokenGenerationInput = {
  lifetime?: InputMaybe<Scalars['String']['input']>;
};

export type UserTokenGenerationPayload = {
  __typename?: 'UserTokenGenerationPayload';
  jwt?: Maybe<Scalars['String']['output']>;
};

export type VipprMeta = {
  __typename?: 'VIPPRMeta';
  comments?: Maybe<Array<Maybe<GitHubComment>>>;
  reviewComments?: Maybe<Array<Maybe<GitHubPullRequestReviewComment>>>;
  reviews?: Maybe<Array<Maybe<GitHubReview>>>;
};

export type WpcliCommand = {
  __typename?: 'WPCLICommand';
  command?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  endedAt?: Maybe<Scalars['String']['output']>;
  environmentId?: Maybe<Scalars['Int']['output']>;
  guid?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  startedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  user?: Maybe<WpcliCommandUser>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type WpcliCommandList = {
  __typename?: 'WPCLICommandList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<WpcliCommand>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type WpcliCommandUser = {
  __typename?: 'WPCLICommandUser';
  displayName?: Maybe<Scalars['String']['output']>;
  githubUsername?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isVIP?: Maybe<Scalars['Boolean']['output']>;
  wpcomUsername?: Maybe<Scalars['String']['output']>;
};

export type WpInstallation = {
  __typename?: 'WPInstallation';
  /** Core WordPress Site Installation Details */
  core?: Maybe<WpInstallationCoreDetails>;
  /** App Environment Name */
  environmentName?: Maybe<Scalars['String']['output']>;
  /** Details about Jetpack */
  jetpack?: Maybe<WpInstallationJetpackDetails>;
  /** Details about all plugins installed */
  plugins?: Maybe<Array<WpInstallationPluginDetails>>;
  /** App Environment / GOOP Site ID */
  siteId?: Maybe<Scalars['Int']['output']>;
  /** Last updated timestamp of the Site Installation Details */
  timestamp?: Maybe<Scalars['BigInt']['output']>;
};

export type WpInstallationCoreDetails = {
  __typename?: 'WPInstallationCoreDetails';
  /** Is WordPress Multisite Installation */
  isMultisite?: Maybe<Scalars['Boolean']['output']>;
  /** WordPress Installation PHP Version */
  phpVersion?: Maybe<Scalars['String']['output']>;
  /** WordPress Installation Version */
  wpVersion?: Maybe<Scalars['String']['output']>;
};

export type WpInstallationJetpackDetails = {
  __typename?: 'WPInstallationJetpackDetails';
  /** Is Jetpack available on WordPress Installation */
  available?: Maybe<Scalars['Boolean']['output']>;
  /** Jetpack Version */
  version?: Maybe<Scalars['String']['output']>;
  /** VIP Jetpack Version */
  vipVersion?: Maybe<Scalars['String']['output']>;
};

export type WpInstallationPluginDetails = {
  __typename?: 'WPInstallationPluginDetails';
  /** WordPress Plugin activated by */
  activatedBy?: Maybe<Scalars['String']['output']>;
  /** Is WordPress Plugin active */
  active: Scalars['Boolean']['output'];
  /** WordPress Plugin update download link */
  downloadLink?: Maybe<Scalars['String']['output']>;
  /** WordPress Plugin available update version */
  hasUpdate?: Maybe<Scalars['String']['output']>;
  /** WordPress Plugin marketplace */
  marketplace?: Maybe<Scalars['String']['output']>;
  /** WordPress Plugin name */
  name: Scalars['String']['output'];
  /** WordPress Plugin path */
  path: Scalars['String']['output'];
  /** WordPress Plugin slug */
  slug?: Maybe<Scalars['String']['output']>;
  /** WordPress Plugin version */
  version: Scalars['String']['output'];
};

export type WpSite = {
  __typename?: 'WPSite';
  /** WordPress Site/Blog ID */
  blogId?: Maybe<Scalars['Int']['output']>;
  /** List of WordPress PHP defines/constants used in the blog */
  constants?: Maybe<Array<Maybe<WpSitePhpConstants>>>;
  /** WordPress Home URL option */
  homeUrl?: Maybe<Scalars['String']['output']>;
  /** [DEPRECATING SOON] Alias for blogId */
  id?: Maybe<Scalars['Int']['output']>;
  /** WP Site Installation Details */
  installation?: Maybe<WpInstallation>;
  /** [DEPRECATING SOON] Is blog active */
  isActive?: Maybe<Scalars['Boolean']['output']>;
  /** Jetpack Details */
  jetpack?: Maybe<WpSiteJetpackDetails>;
  /** [DEPRECATING SOON] Alias for jetpack */
  jetpackDetails?: Maybe<WpSiteJetpackDetails>;
  /** Launched status of the subsite */
  launchStatus?: Maybe<WpSiteLaunchStatus>;
  /** Details about Parse.ly plugin (wp-parsely) usage */
  parsely?: Maybe<WpSiteParselyDetails>;
  /** List of enabled plugins on the blog */
  plugins?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  /** WordPress Site URL option */
  siteUrl?: Maybe<Scalars['String']['output']>;
  /** Last updated timestamp of the Site Details */
  timestamp?: Maybe<Scalars['BigInt']['output']>;
};

export type WpSiteJetpackDetails = {
  __typename?: 'WPSiteJetpackDetails';
  /** Is Jetpack Active */
  active?: Maybe<Scalars['Boolean']['output']>;
  /** [DEPRECATING SOON] Jetpack Cache Site ID */
  cacheSiteId?: Maybe<Scalars['Int']['output']>;
  /** Jetpack Cache Site ID */
  id?: Maybe<Scalars['String']['output']>;
  /** Enabled Jetpack modules */
  modules?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export enum WpSiteLaunchStatus {
  Launched = 'LAUNCHED',
  Launching = 'LAUNCHING',
  NotLaunched = 'NOT_LAUNCHED',
  Unknown = 'UNKNOWN'
}

/** Variables for the UpdateWPSiteLaunchStatus mutation */
export type WpSiteLaunchStatusInput = {
  /** Unique ID of the application */
  appId: Scalars['Int']['input'];
  /** Unique ID of the environment */
  environmentId: Scalars['Int']['input'];
  /** Updated launch status of the network site */
  launchStatus: WpSiteLaunchStatus;
  /** ID of the network site (subsite) being updated */
  networkSiteId: Scalars['Int']['input'];
};

/** Variables for the UpdateWPSiteLaunchStatus mutation */
export type WpSiteLaunchStatusPayload = {
  __typename?: 'WPSiteLaunchStatusPayload';
  app?: Maybe<App>;
  environment?: Maybe<AppEnvironment>;
  launchStatus?: Maybe<Scalars['String']['output']>;
  /** ID of the network site (subsite) being updated */
  networkSiteId?: Maybe<Scalars['Int']['output']>;
  /** Updated launch status of the network site */
  updated?: Maybe<Scalars['Boolean']['output']>;
};

export type WpSiteList = {
  __typename?: 'WPSiteList';
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes?: Maybe<Array<Maybe<WpSite>>>;
  total?: Maybe<Scalars['Int']['output']>;
};

export type WpSiteParselyConfigs = {
  __typename?: 'WPSiteParselyConfigs';
  /** Does the site have a Parse.ly API Secret configured? */
  haveApiSecret?: Maybe<Scalars['Boolean']['output']>;
  /** Is autotrack disabled (to allow Dynamic Tracking to be used)? */
  isAutotrackingDisabled?: Maybe<Scalars['Boolean']['output']>;
  /** Is JavaScript Tracking disabled? */
  isJavascriptDisabled?: Maybe<Scalars['Boolean']['output']>;
  /** Is the site pinned to the specific plugin version? */
  isPinnedVersion?: Maybe<Scalars['Boolean']['output']>;
  /** Is JavaScript tracking enabled for logged in users? */
  shouldTrackLoggedInUsers?: Maybe<Scalars['Boolean']['output']>;
  /** Parse.ly Site ID (aka apikey) */
  siteId?: Maybe<Scalars['String']['output']>;
  /** Details about tracked post types */
  trackedPostTypes?: Maybe<Array<Maybe<WpSiteParselyTrackedPostTypesConfig>>>;
};

export type WpSiteParselyDetails = {
  __typename?: 'WPSiteParselyDetails';
  /** Is wp-parsely active? */
  active?: Maybe<Scalars['Boolean']['output']>;
  /** Details about how the plugin is configured on site */
  configs?: Maybe<WpSiteParselyConfigs>;
  /** How wp-parsely is activated (if active) */
  integrationType?: Maybe<Scalars['String']['output']>;
  /** Version for the wp-parsely plugin */
  version?: Maybe<Scalars['String']['output']>;
};

export type WpSiteParselyTrackedPostTypesConfig = {
  __typename?: 'WPSiteParselyTrackedPostTypesConfig';
  /** The slug for the post type */
  name?: Maybe<Scalars['String']['output']>;
  /** How is the post type tracked within Parse.ly? (post, non-post, or do-not-track) */
  trackType?: Maybe<Scalars['String']['output']>;
};

export type WpSitePhpConstants = {
  __typename?: 'WPSitePhpConstants';
  /** WordPress PHP Define/Constant key */
  name?: Maybe<Scalars['String']['output']>;
  /** WordPress PHP Define/Constant value */
  value?: Maybe<Scalars['String']['output']>;
};
