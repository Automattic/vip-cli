export type Maybe< T > = T | null;
export type InputMaybe< T > = Maybe< T >;
export type Exact< T extends { [ key: string ]: unknown } > = { [ K in keyof T ]: T[ K ] };
export type MakeOptional< T, K extends keyof T > = Omit< T, K > & {
	[ SubKey in K ]?: Maybe< T[ SubKey ] >;
};
export type MakeMaybe< T, K extends keyof T > = Omit< T, K > & {
	[ SubKey in K ]: Maybe< T[ SubKey ] >;
};
export type MakeEmpty< T extends { [ key: string ]: unknown }, K extends keyof T > = {
	[ _ in K ]?: never;
};
export type Incremental< T > =
	| T
	| { [ P in keyof T ]?: P extends ' $fragmentName' | '__typename' ? T[ P ] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
	ID: { input: string; output: string };
	String: { input: string; output: string };
	Boolean: { input: boolean; output: boolean };
	Int: { input: number; output: number };
	Float: { input: number; output: number };
	BigInt: { input: any; output: any };
	Date: { input: any; output: any };
	JSON: { input: any; output: any };
	MediaImportAllowedFileTypes: { input: any; output: any };
};

export type AcceptInvitationInput = {
	invitationCode?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AcceptInvitationPayload = {
	__typename?: 'AcceptInvitationPayload';
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type ActivateCertificateBySiteInput = {
	bypassDomainValidation?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	certificateId: Scalars[ 'Int' ][ 'input' ];
	clientSiteId: Scalars[ 'Int' ][ 'input' ];
	skipConfigReloads?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type ActivateCertificateBySitePayload = {
	__typename?: 'ActivateCertificateBySitePayload';
	failedDomains?: Maybe< Array< Maybe< Scalars[ 'Int' ][ 'output' ] > > >;
	status: Scalars[ 'String' ][ 'output' ];
};

export type ActivateCertificateInput = {
	certificateId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	domainNames?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type ActivateCertificatePayload = {
	__typename?: 'ActivateCertificatePayload';
	certificateId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AddCertificateInput = {
	certificate: Scalars[ 'String' ][ 'input' ];
	clientId: Scalars[ 'Int' ][ 'input' ];
	csr: Scalars[ 'String' ][ 'input' ];
	domainName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	key: Scalars[ 'String' ][ 'input' ];
	trustedCertificate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AddCertificatePayload = {
	__typename?: 'AddCertificatePayload';
	certificate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	certificateId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AddNotificationRecipientInput = {
	appId?: InputMaybe< Scalars[ 'BigInt' ][ 'input' ] >;
	description?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	meta?: InputMaybe< NotificationRecipientMetaInput >;
	name: Scalars[ 'String' ][ 'input' ];
	organizationId: Scalars[ 'BigInt' ][ 'input' ];
	recipientType: NotificationRecipientType;
	recipientValue: Scalars[ 'String' ][ 'input' ];
};

export type AddNotificationRecipientPayload = {
	__typename?: 'AddNotificationRecipientPayload';
	notificationRecipient?: Maybe< NotificationRecipient >;
};

export type AddNotificationSubscriptionInput = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	description: Scalars[ 'String' ][ 'input' ];
	entityType: Scalars[ 'String' ][ 'input' ];
	entityValue: Scalars[ 'String' ][ 'input' ];
	meta?: InputMaybe< NotificationSubscriptionMetaInput >;
	notificationRecipientId: Scalars[ 'BigInt' ][ 'input' ];
	organizationId: Scalars[ 'BigInt' ][ 'input' ];
	vin?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type AddNotificationSubscriptionPayload = {
	__typename?: 'AddNotificationSubscriptionPayload';
	notificationSubscription?: Maybe< NotificationSubscription >;
};

export type AggregatedMetricMeasurements = {
	__typename?: 'AggregatedMetricMeasurements';
	aggrFunction?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	currTotalAggr?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	measurementUnit?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	measurements: Array< Maybe< MetricMeasurement > >;
	metricDisplayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	metricName: Scalars[ 'String' ][ 'output' ];
	prevTotalAggr?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	queryId: Scalars[ 'String' ][ 'output' ];
	resolution?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type Anomaly429ContextData = AnomalyContextData & {
	__typename?: 'Anomaly429ContextData';
	topCountryCodes: Array< Maybe< AnomalyContextTable > >;
	topHosts: Array< Maybe< AnomalyContextTable > >;
	topRemoteAddr: Array< Maybe< AnomalyContextTable > >;
	topUserAgents: Array< Maybe< AnomalyContextTable > >;
	totalRequests: Scalars[ 'Int' ][ 'output' ];
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AnomalyContextData = {
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AnomalyContextTable = {
	__typename?: 'AnomalyContextTable';
	count: Scalars[ 'Int' ][ 'output' ];
	item: Scalars[ 'String' ][ 'output' ];
};

export type App = Model & {
	__typename?: 'App';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	environments?: Maybe< Array< Maybe< AppEnvironment > > >;
	features?: Maybe< Array< Maybe< Feature > > >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organization?: Maybe< Organization >;
	organizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	pageviews?: Maybe< Pageviews >;
	permissions?: Maybe< Array< Maybe< PermissionResult > > >;
	primaryEnvironment?: Maybe< AppEnvironment >;
	repo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	repository?: Maybe< GitRepository >;
	serviceStatus?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	supportPackage?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	typeId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentsArgs = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	type?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppNotificationSubscriptionsArgs = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	notificationRecipientId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationSubscriptionsOnly?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	vin?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type AppPermissionsArgs = {
	permissions?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironment = {
	__typename?: 'AppEnvironment';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	activeBackup?: Maybe< Backup >;
	allowedIPs?: Maybe< AppEnvironmentIpAllowList >;
	anomalyContext?: Maybe< MetricAnomalyContext >;
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	backupPolicyId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** @deprecated Use `backupShippingConfigV2` instead. */
	backupShippingConfig?: Maybe< AppEnvironmentBackupShipping >;
	backupShippingConfigV2?: Maybe< AppEnvironmentBackupShippingV2 >;
	backups?: Maybe< BackupsList >;
	backupsSqlDumpTool?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	basicAuth?: Maybe< AppEnvironmentBasicAuth >;
	branch?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	branches?: Maybe< AppEnvironmentBranchesList >;
	buildConfiguration?: Maybe< BuildConfiguration >;
	builds?: Maybe< BuildList >;
	/** Get codebase related information */
	codebase?: Maybe< CodebaseInfo >;
	commands?: Maybe< WpcliCommandList >;
	commits?: Maybe< GitCommitList >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	currentCommit?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	customErrorPageConfig?: Maybe< CustomErrorPageConfig >;
	datacenter?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	dbBackupCopies?: Maybe< DbBackupCopyList >;
	dbOperationInProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	defaultDomain?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	deploymentStrategy?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	deployments?: Maybe< DeploymentList >;
	deploys?: Maybe< DeployList >;
	domains?: Maybe< DomainList >;
	edgeConfig?: Maybe< EdgeConfig >;
	environmentVariables?: Maybe< EnvironmentVariablesList >;
	events?: Maybe< AuditEventList >;
	eventsCounts?: Maybe< Array< Maybe< AuditEventCount > > >;
	getIntegrationsDevEnvConfig?: Maybe< IntegrationDevEnvConfig >;
	health?: Maybe< AppEnvironmentHealth >;
	hstsSettings?: Maybe< AppEnvironmentHstsSettings >;
	icon?: Maybe< AppEnvironmentIcon >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	importStatus?: Maybe< AppEnvironmentImportStatus >;
	integration?: Maybe< Integration >;
	integrations?: Maybe< IntegrationList >;
	ips?: Maybe< AppEnvironmentIPs >;
	isDBPartitioningEnabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isFedramp?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isK8sResident?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isLiveBackupCopyAllowed?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isMultisite?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isOnLatestCode?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isSubdirectoryMultisite?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	jobs?: Maybe< Array< Maybe< JobInterface > > >;
	latestBackup?: Maybe< Backup >;
	latestMediaExport?: Maybe< MediaExport >;
	launchModeEndAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	launched?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	liveBackupCopies?: Maybe< Array< Maybe< LiveBackupCopy > > >;
	logShippingConfig?: Maybe< AppEnvironmentLogShippingV2 >;
	logs?: Maybe< AppEnvironmentLogsList >;
	/** @deprecated Use `logShippingConfig` instead. */
	logsConfig?: Maybe< AppEnvironmentLogShipping >;
	mediaExports?: Maybe< MediaExportsList >;
	mediaImportStatus?: Maybe< AppEnvironmentMediaImportStatus >;
	metricAnomalies?: Maybe< MetricAnomaliesList >;
	metricThresholds?: Maybe< Array< Maybe< MetricThreshold > > >;
	metrics?: Maybe< AggregatedMetricMeasurements >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	newRelic?: Maybe< AppEnvironmentNewRelic >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	permissions?: Maybe< Array< Maybe< PermissionResult > > >;
	phpMyAdminStatus?: Maybe< PhpMyAdminStatus >;
	primaryDomain?: Maybe< Domain >;
	primaryDomainSwitchProgress?: Maybe< AppEnvironmentPrimaryDomainSwitchProgress >;
	repo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	requestStats?: Maybe< RequestStatsList >;
	slowlogs?: Maybe< AppEnvironmentSlowlogsList >;
	software?: Maybe< AppEnvironmentSoftwareDetails >;
	softwareSettings?: Maybe< AppEnvironmentSoftwareSettings >;
	syncPreview?: Maybe< AppEnvironmentSyncPreview >;
	syncProgress?: Maybe< AppEnvironmentSyncProgress >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	uniqueLabel?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updateSubsiteDomainStatus?: Maybe< AppEnvironmentUpdateSubsiteDomainStatus >;
	/** Get WordPress Site Installation Details */
	wpInstallation?: Maybe< WpInstallation >;
	/** Get WordPress Site Details */
	wpSites?: Maybe< WpSiteList >;
	/** Get WordPress Site Details from SDS */
	wpSitesSDS?: Maybe< WpSiteList >;
	wpcliStrategy?: Maybe< AppEnvironmentWpCliStrategy >;
};

export type AppEnvironmentAnomalyContextArgs = {
	anomalyId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentBackupsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	endDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Float' ][ 'input' ] >;
	startDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentBranchesArgs = {
	limit?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentCommandsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	order?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	sort?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	status?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentCommitsArgs = {
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentDbBackupCopiesArgs = {
	fileNames?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironmentDeploymentsArgs = {
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	nextCursor?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentDeploysArgs = {
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentDomainsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	isVerified?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentEventsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	afterTs?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	beforeTs?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	excludeAnomalyEvents?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	excludeWPCLI?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	types?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentEventsCountsArgs = {
	from?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	to?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	types?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironmentHealthArgs = {
	endDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	startDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentIconArgs = {
	size?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentIntegrationArgs = {
	networkSiteId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	slug?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentJobsArgs = {
	jobTypes?: InputMaybe< Array< AppEnvironmentJobType > >;
	types?: InputMaybe< Array< Scalars[ 'String' ][ 'input' ] > >;
};

export type AppEnvironmentLogsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	limit?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	type?: InputMaybe< AppEnvironmentLogType >;
};

export type AppEnvironmentMediaExportsArgs = {
	nextCursor?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentMetricAnomaliesArgs = {
	algorithmVersion?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	excludeCustomAnomalies?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	fromDate?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
	metricName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	toDate?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
};

export type AppEnvironmentMetricThresholdsArgs = {
	metricName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentMetricsArgs = {
	aggregate?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	fromDate?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
	includeBaseline?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	metricName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	toDate?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
};

export type AppEnvironmentNotificationSubscriptionsArgs = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	notificationRecipientId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentPermissionsArgs = {
	permissions?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironmentPrimaryDomainSwitchProgressArgs = {
	primaryDomainSwitchId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentRequestStatsArgs = {
	date?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	days?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	from?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	months?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	to?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentSlowlogsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	limit?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentSyncProgressArgs = {
	sync?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentWpSitesArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentWpSitesSdsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	blogId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	launchStatus?: InputMaybe< WpSiteLaunchStatus >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	order?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	sort?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

/** Mutation request input to abort a Media Import */
export type AppEnvironmentAbortMediaImportInput = {
	/** The unique ID of the Application */
	applicationId: Scalars[ 'Int' ][ 'input' ];
	/** The uniqueID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

/** Response payload for aborting a Media Import */
export type AppEnvironmentAbortMediaImportPayload = {
	__typename?: 'AppEnvironmentAbortMediaImportPayload';
	/** The unique ID of the Application */
	applicationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** The unique ID of the Environment */
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Media Import Abort Action Response */
	mediaImportStatusChange?: Maybe< AppEnvironmentMediaImportStatusChange >;
};

/** Variables for the Activate Let's Encrypt Mutation */
export type AppEnvironmentActivateLetsEncryptOnDomainInput = {
	/** The unique ID for the domain */
	domainId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** The ID of the environment that this domain belongs to */
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** The unique ID for the domain */
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** Provisions the www-alt domain */
	includeWWW?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	/** Overrides the existing certificate (if any) on the domain */
	overrideExisting?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

/** Response from the Activate Let's Encrypt Mutation */
export type AppEnvironmentActivateLetsEncryptOnDomainPayload = {
	__typename?: 'AppEnvironmentActivateLetsEncryptOnDomainPayload';
	/** The domain that Let's Encrypt was activated on */
	domain?: Maybe< Domain >;
};

/** Variables for the Add Domain mutation */
export type AppEnvironmentAddDomainInput = {
	/** The domain name (i.e. something like example.com or sub.example.com) */
	domain?: InputMaybe< NewDomain >;
	/** The ID of the environment that this domain belongs to */
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** Flag to set verification code */
	generateVerificationCode?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	/** The App ID */
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentAddDomainPayload = {
	__typename?: 'AppEnvironmentAddDomainPayload';
	domain?: Maybe< Domain >;
};

export type AppEnvironmentAddNewRelicUserInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	email: Scalars[ 'String' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	firstName: Scalars[ 'String' ][ 'input' ];
	lastName: Scalars[ 'String' ][ 'input' ];
};

export type AppEnvironmentAddNewRelicUserPayload = {
	__typename?: 'AppEnvironmentAddNewRelicUserPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

/** Variables for the AddRequestStats mutation */
export type AppEnvironmentAddRequestStatsInput = {
	/** The application ID */
	applicationId: Scalars[ 'Int' ][ 'input' ];
	/** Date for which we want to sync - if we want to sync only for one day */
	date?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The environment ID where we want to run the command */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** Date range for which we want to sync - if we want to sync for a range */
	fromDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	toDate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

/** Response payload for Request Stats */
export type AppEnvironmentAddRequestStatsPayload = {
	__typename?: 'AppEnvironmentAddRequestStatsPayload';
	/** The unique ID of the Application */
	applicationId: Scalars[ 'Int' ][ 'output' ];
	/** The unique ID of the environment */
	environmentId: Scalars[ 'Int' ][ 'output' ];
};

export type AppEnvironmentBackup = {
	__typename?: 'AppEnvironmentBackup';
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	size?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentBackupShipping = {
	__typename?: 'AppEnvironmentBackupShipping';
	awsAccountId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	bucket?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	dailyHour?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	region?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	schedule?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentBackupShippingDeleteInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentBackupShippingInput = {
	awsAccountId?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	bucket?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	dailyHour?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	enabled?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	region?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	schedule?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentBackupShippingOperationResultPayload = {
	__typename?: 'AppEnvironmentBackupShippingOperationResultPayload';
	message: Scalars[ 'String' ][ 'output' ];
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentBackupShippingPayload = {
	__typename?: 'AppEnvironmentBackupShippingPayload';
	app?: Maybe< App >;
	awsAccountId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	bucket?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	dailyHour?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	region?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	schedule?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentBackupShippingUpdateStatusInput = {
	enabled: Scalars[ 'Boolean' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentBackupShippingV2 = {
	__typename?: 'AppEnvironmentBackupShippingV2';
	dailyHour?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	enabled: Scalars[ 'Boolean' ][ 'output' ];
	object_storage_config_gcp?: Maybe< CloudShippingObjectStorageConfigGcp >;
	object_storage_config_s3?: Maybe< CloudShippingObjectStorageConfigS3 >;
	path?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	provider: CloudShippingObjectStorageProviders;
	schedule: BackupShippingSchedule;
};

export type AppEnvironmentBackupShippingV2Input = {
	dailyHour?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	enabled: Scalars[ 'Boolean' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
	object_storage_config_gcp?: InputMaybe< CloudShippingObjectStorageConfigGcpInput >;
	object_storage_config_s3?: InputMaybe< CloudShippingObjectStorageConfigS3Input >;
	path?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	provider: CloudShippingObjectStorageProviders;
	schedule?: InputMaybe< BackupShippingSchedule >;
};

export type AppEnvironmentBackupShippingValidationPayload = {
	__typename?: 'AppEnvironmentBackupShippingValidationPayload';
	app?: Maybe< App >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentBasicAuth = {
	__typename?: 'AppEnvironmentBasicAuth';
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	users?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
};

export type AppEnvironmentBasicAuthDeleteInput = {
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	username?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironmentBasicAuthInput = {
	basicAuth?: InputMaybe< Array< InputMaybe< AppEnvironmentBasicAuthUserInput > > >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentBasicAuthPayload = {
	__typename?: 'AppEnvironmentBasicAuthPayload';
	app?: Maybe< App >;
	user?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentBasicAuthUserInput = {
	password?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	username?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentBranch = {
	__typename?: 'AppEnvironmentBranch';
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentBranchesList = {
	__typename?: 'AppEnvironmentBranchesList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< AppEnvironmentBranch > > >;
	pollingDelaySeconds: Scalars[ 'Int' ][ 'output' ];
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentCustomDeployInput = {
	basename?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	checksum?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	deployMessage?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentCustomDeployPayload = {
	__typename?: 'AppEnvironmentCustomDeployPayload';
	app?: Maybe< App >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentDeactivateDomainInput = {
	domainId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentDeactivateDomainPayload = {
	__typename?: 'AppEnvironmentDeactivateDomainPayload';
	domain?: Maybe< Domain >;
};

export type AppEnvironmentDeleteNewRelicUserInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	userId: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentDeleteNewRelicUserPayload = {
	__typename?: 'AppEnvironmentDeleteNewRelicUserPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentDisableNewRelicInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentDisableNewRelicPayload = {
	__typename?: 'AppEnvironmentDisableNewRelicPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentEnableDisableCustomDeployInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentEnableDisableCustomDeployPayload = {
	__typename?: 'AppEnvironmentEnableDisableCustomDeployPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentEnableLaunchModeInput = {
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	launchModeEndAt?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentEnableLaunchModePayload = {
	__typename?: 'AppEnvironmentEnableLaunchModePayload';
	app?: Maybe< App >;
	environment?: Maybe< AppEnvironment >;
};

export type AppEnvironmentEnableNewRelicInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentEnableNewRelicPayload = {
	__typename?: 'AppEnvironmentEnableNewRelicPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentGenerateDbBackupCopyUrlInput = {
	backupId?: InputMaybe< Scalars[ 'Float' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentGenerateDbBackupCopyUrlPayload = {
	__typename?: 'AppEnvironmentGenerateDBBackupCopyUrlPayload';
	app?: Maybe< App >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentGenerateMediaExportSignedUrlInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	archiveFileIndex?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	mediaExportId?: InputMaybe< Scalars[ 'Float' ][ 'input' ] >;
	target?: InputMaybe< AppEnvironmentGenerateMediaExportSignedUrlTarget >;
};

export type AppEnvironmentGenerateMediaExportSignedUrlPayload = {
	__typename?: 'AppEnvironmentGenerateMediaExportSignedUrlPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentGenerateMediaExportSignedUrlTarget = 'media' | 'report';

export type AppEnvironmentGenericSoftware = AppEnvironmentSoftware & {
	__typename?: 'AppEnvironmentGenericSoftware';
	version: Scalars[ 'String' ][ 'output' ];
};

/** Details about the environment's HSTS settings */
export type AppEnvironmentHstsSettings = {
	__typename?: 'AppEnvironmentHSTSSettings';
	/** Whether HSTS is enabled for an App Environment */
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Whether the header includes the includesSubdomains directive */
	includeSubdomains?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** The value of the max-age directive */
	maxAge?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Whether the header includes the preload directive */
	preload?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Whether the App Environment enforces HTTPS everywhere */
	sslEverywhere?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

/** Variables for the UpdateHSTSSettings mutation */
export type AppEnvironmentHstsSettingsInput = {
	/** The unique ID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** The unique ID of the Application */
	id: Scalars[ 'Int' ][ 'input' ];
	/** Whether the header should include the includesSubdomains directive */
	includeSubdomains?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	/** The value of the max-age directive */
	maxAge?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** Whether the header should include the preload directive */
	preload?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

/** Response payload for HSTS Settings updates */
export type AppEnvironmentHstsSettingsPayload = {
	__typename?: 'AppEnvironmentHSTSSettingsPayload';
	/** The Application that was updated */
	app?: Maybe< App >;
	/** The response message from GOOP */
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Whether the update was successful */
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentHealth = {
	__typename?: 'AppEnvironmentHealth';
	cacheHit?: Maybe< AppEnvironmentHealthCacheList >;
	cacheMiss?: Maybe< AppEnvironmentHealthCacheList >;
	responseCodes?: Maybe< AppEnvironmentHealthList >;
};

export type AppEnvironmentHealthCacheList = {
	__typename?: 'AppEnvironmentHealthCacheList';
	nodes?: Maybe< Array< Maybe< AppEnvironmentHealthCacheNodes > > >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentHealthCacheNodes = {
	__typename?: 'AppEnvironmentHealthCacheNodes';
	from?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	to?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentHealthList = {
	__typename?: 'AppEnvironmentHealthList';
	codes?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	nodes?: Maybe< Array< Maybe< AppEnvironmentHealthNodes > > >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentHealthNodes = {
	__typename?: 'AppEnvironmentHealthNodes';
	_200?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_201?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_206?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_301?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_302?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_304?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_400?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_401?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_403?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_404?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_405?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_408?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_412?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_416?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_429?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_499?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_500?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_502?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_503?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	_504?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	from?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	to?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentIpAllowList = {
	__typename?: 'AppEnvironmentIPAllowList';
	ips?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentIPs = {
	__typename?: 'AppEnvironmentIPs';
	ipv4?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	ipv6?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
};

export type AppEnvironmentIcon = {
	__typename?: 'AppEnvironmentIcon';
	height?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	width?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentImportInput = {
	basename?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	md5?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	searchReplace?: InputMaybe< Array< InputMaybe< AppEnvironmentImportSearchReplace > > >;
	skipMaintenanceMode?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	url?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentImportPayload = {
	__typename?: 'AppEnvironmentImportPayload';
	app?: Maybe< App >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentImportSearchReplace = {
	from?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	to?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentImportStatus = {
	__typename?: 'AppEnvironmentImportStatus';
	dbOperationInProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	importInProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	progress?: Maybe< AppEnvironmentStatusProgress >;
};

export type AppEnvironmentJobType =
	| 'db_backup'
	| 'db_backup_copy'
	| 'set_primary_domain'
	| 'sql_import'
	| 'update_subsite_domain'
	| 'upgrade_muplugins'
	| 'upgrade_nodejs'
	| 'upgrade_php'
	| 'upgrade_wordpress';

export type AppEnvironmentLaunchedInput = {
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentLaunchedPayload = {
	__typename?: 'AppEnvironmentLaunchedPayload';
	app?: Maybe< App >;
	environment?: Maybe< AppEnvironment >;
};

export type AppEnvironmentListNewRelicInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentLiveBackupCopyDownloadUrlInput = {
	copyId: Scalars[ 'String' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentLiveBackupCopyDownloadUrlPayload = {
	__typename?: 'AppEnvironmentLiveBackupCopyDownloadURLPayload';
	processing: Scalars[ 'Boolean' ][ 'output' ];
	success: Scalars[ 'Boolean' ][ 'output' ];
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentLog = {
	__typename?: 'AppEnvironmentLog';
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	timestamp?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentLogShipping = {
	__typename?: 'AppEnvironmentLogShipping';
	awsAccountId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	bucket?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	region?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentLogShippingDeleteInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentLogShippingInput = {
	awsAccountId?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	bucket?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	enabled?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	region?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentLogShippingOperationResultPayload = {
	__typename?: 'AppEnvironmentLogShippingOperationResultPayload';
	message: Scalars[ 'String' ][ 'output' ];
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type AppEnvironmentLogShippingPayload = {
	__typename?: 'AppEnvironmentLogShippingPayload';
	app?: Maybe< App >;
	awsAccountId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	bucket?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	region?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentLogShippingUpdateStatusInput = {
	enabled: Scalars[ 'Boolean' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentLogShippingV2 = {
	__typename?: 'AppEnvironmentLogShippingV2';
	enabled: Scalars[ 'Boolean' ][ 'output' ];
	object_storage_config_gcp?: Maybe< CloudShippingObjectStorageConfigGcp >;
	object_storage_config_s3?: Maybe< CloudShippingObjectStorageConfigS3 >;
	path?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	provider: CloudShippingObjectStorageProviders;
	type: Array< CloudShippingLogsType >;
};

export type AppEnvironmentLogShippingV2Input = {
	enabled: Scalars[ 'Boolean' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
	object_storage_config_gcp?: InputMaybe< CloudShippingObjectStorageConfigGcpInput >;
	object_storage_config_s3?: InputMaybe< CloudShippingObjectStorageConfigS3Input >;
	path?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	provider: CloudShippingObjectStorageProviders;
	type: Array< CloudShippingLogsType >;
};

export type AppEnvironmentLogShippingValidationPayload = {
	__typename?: 'AppEnvironmentLogShippingValidationPayload';
	app?: Maybe< App >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentLogType = 'app' | 'batch';

export type AppEnvironmentLogsList = {
	__typename?: 'AppEnvironmentLogsList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< AppEnvironmentLog > > >;
	pollingDelaySeconds: Scalars[ 'Int' ][ 'output' ];
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

/** Response payload for starting and fetching a Media Import */
export type AppEnvironmentMediaImportPayload = {
	__typename?: 'AppEnvironmentMediaImportPayload';
	/** The unique ID of the Application */
	applicationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** The unique ID of the Environment */
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Media Import Status */
	mediaImportStatus: AppEnvironmentMediaImportStatus;
};

/** Current status of a Media Import */
export type AppEnvironmentMediaImportStatus = {
	__typename?: 'AppEnvironmentMediaImportStatus';
	/** Media Import failure details */
	failureDetails?: Maybe< AppEnvironmentMediaImportStatusFailureDetails >;
	/** URL to download the media import error log */
	failureDetailsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Total number of media files that were imported */
	filesProcessed?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Total number of media files that are to be import */
	filesTotal?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Unique Identifier for a Media Import */
	importId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Alias of environmentId */
	siteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** The actual status of the Media Import */
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

/** Response payload for executing a status change action on a Media Import */
export type AppEnvironmentMediaImportStatusChange = {
	__typename?: 'AppEnvironmentMediaImportStatusChange';
	/** Unique Identifier for a Media Import */
	importId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Alias of environmentId */
	siteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** The status of Media Import prior to status change action */
	statusFrom?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** The status of Media Import after the status change action */
	statusTo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

/** Media Import Failure details */
export type AppEnvironmentMediaImportStatusFailureDetails = {
	__typename?: 'AppEnvironmentMediaImportStatusFailureDetails';
	/** List of errors per file */
	fileErrors?: Maybe< Array< Maybe< AppEnvironmentMediaImportStatusFailureDetailsFileErrors > > >;
	/** URL to download the media import error log */
	fileErrorsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** List of global errors per import */
	globalErrors?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	/** Status of the Media Import prior to failing */
	previousStatus?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

/** Media Import File Errors */
export type AppEnvironmentMediaImportStatusFailureDetailsFileErrors = {
	__typename?: 'AppEnvironmentMediaImportStatusFailureDetailsFileErrors';
	/** List of Errors per file */
	errors?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	/** File Name */
	fileName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentNewRelic = {
	__typename?: 'AppEnvironmentNewRelic';
	canManageUsers?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	dashboardUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	deactivationTimestamp?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isSetupComplete?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	samplingPercentage?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	users?: Maybe< AppEnvironmentNewRelicUsersList >;
};

export type AppEnvironmentNewRelicUser = {
	__typename?: 'AppEnvironmentNewRelicUser';
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentNewRelicUsersList = {
	__typename?: 'AppEnvironmentNewRelicUsersList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< AppEnvironmentNewRelicUser > > >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentPrimaryDomainSwitchInput = {
	domainId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentPrimaryDomainSwitchPayload = {
	__typename?: 'AppEnvironmentPrimaryDomainSwitchPayload';
	app?: Maybe< App >;
	domain?: Maybe< Domain >;
	environment?: Maybe< AppEnvironment >;
	primaryDomainSwitchId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentPrimaryDomainSwitchProgress = {
	__typename?: 'AppEnvironmentPrimaryDomainSwitchProgress';
	destinationDomain?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	primaryDomainSwitchId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	sourceDomain?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	steps?: Maybe< Array< Maybe< AppEnvironmentPrimaryDomainSwitchProgressStep > > >;
};

export type AppEnvironmentPrimaryDomainSwitchProgressStep = {
	__typename?: 'AppEnvironmentPrimaryDomainSwitchProgressStep';
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	step?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentRetireInput = {
	/** The unique ID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** The unique ID of the Application */
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentRetirePayload = {
	__typename?: 'AppEnvironmentRetirePayload';
	/** The response message from GOOP */
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Whether the retirement was successful */
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentSlowlog = {
	__typename?: 'AppEnvironmentSlowlog';
	query?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	queryTime?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	requestUri?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	rowsExamined?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	rowsSent?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	timestamp?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentSlowlogsList = {
	__typename?: 'AppEnvironmentSlowlogsList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< AppEnvironmentSlowlog > > >;
	pollingDelaySeconds: Scalars[ 'Int' ][ 'output' ];
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type AppEnvironmentSoftware = {
	version: Scalars[ 'String' ][ 'output' ];
};

export type AppEnvironmentSoftwareDetails = {
	__typename?: 'AppEnvironmentSoftwareDetails';
	nodejs?: Maybe< AppEnvironmentGenericSoftware >;
	php?: Maybe< AppEnvironmentGenericSoftware >;
	wordpress?: Maybe< AppEnvironmentGenericSoftware >;
};

export type AppEnvironmentSoftwareSettings = {
	__typename?: 'AppEnvironmentSoftwareSettings';
	muplugins?: Maybe< AppEnvironmentSoftwareSettingsSoftware >;
	nodejs?: Maybe< AppEnvironmentSoftwareSettingsSoftware >;
	php?: Maybe< AppEnvironmentSoftwareSettingsSoftware >;
	wordpress?: Maybe< AppEnvironmentSoftwareSettingsSoftware >;
};

/** Variables for the UpdateSoftwareSettings mutation */
export type AppEnvironmentSoftwareSettingsInput = {
	/** The unique ID of the Application */
	appId: Scalars[ 'Int' ][ 'input' ];
	/** The unique ID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** The name of the software being updated */
	softwareName: Scalars[ 'String' ][ 'input' ];
	/** The version the software is being updated to */
	softwareVersion: Scalars[ 'String' ][ 'input' ];
};

export type AppEnvironmentSoftwareSettingsSoftware = {
	__typename?: 'AppEnvironmentSoftwareSettingsSoftware';
	current: AppEnvironmentSoftwareSettingsVersion;
	name: Scalars[ 'String' ][ 'output' ];
	options: Array< AppEnvironmentSoftwareSettingsVersion >;
	pinned: Scalars[ 'Boolean' ][ 'output' ];
	slug: Scalars[ 'String' ][ 'output' ];
};

export type AppEnvironmentSoftwareSettingsVersion = {
	__typename?: 'AppEnvironmentSoftwareSettingsVersion';
	compatible: Scalars[ 'Boolean' ][ 'output' ];
	default: Scalars[ 'Boolean' ][ 'output' ];
	deprecated: Scalars[ 'Boolean' ][ 'output' ];
	latestRelease: Scalars[ 'String' ][ 'output' ];
	private: Scalars[ 'Boolean' ][ 'output' ];
	unstable: Scalars[ 'Boolean' ][ 'output' ];
	version: Scalars[ 'String' ][ 'output' ];
};

export type AppEnvironmentStartDbBackupCopyInput = {
	backupId?: InputMaybe< Scalars[ 'Float' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	subsiteId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	tables?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type AppEnvironmentStartDbBackupCopyPayload = {
	__typename?: 'AppEnvironmentStartDBBackupCopyPayload';
	app?: Maybe< App >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentStartLiveBackupCopyPayload = {
	__typename?: 'AppEnvironmentStartLiveBackupCopyPayload';
	copyId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

/** Mutation request input to start a Media Import */
export type AppEnvironmentStartMediaImportInput = {
	/** API version to be used for the media import */
	apiVersion?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The unique ID of the Application */
	applicationId: Scalars[ 'Int' ][ 'input' ];
	/** Publicly accessible URL that contains an archive of the media files to be imported */
	archiveUrl: Scalars[ 'String' ][ 'input' ];
	/** The uniqueID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** Whether to import intermediate images or not */
	importIntermediateImages?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	/** Whether to overwrite existing files or not */
	overwriteExistingFiles?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type AppEnvironmentStatusProgress = {
	__typename?: 'AppEnvironmentStatusProgress';
	finished_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	started_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	steps?: Maybe< Array< Maybe< AppEnvironmentStatusProgressStep > > >;
};

export type AppEnvironmentStatusProgressStep = {
	__typename?: 'AppEnvironmentStatusProgressStep';
	finished_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	output?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	result?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	started_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentSyncConfig = {
	__typename?: 'AppEnvironmentSyncConfig';
	files?: Maybe< Array< Maybe< AppEnvironmentSyncConfigFile > > >;
	settingsYml?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentSyncConfigFile = {
	__typename?: 'AppEnvironmentSyncConfigFile';
	apiUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	branch?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	contents?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	filename?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	repo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentSyncError = {
	__typename?: 'AppEnvironmentSyncError';
	code?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentSyncInput = {
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AppEnvironmentSyncPayload = {
	__typename?: 'AppEnvironmentSyncPayload';
	app?: Maybe< App >;
	environment?: Maybe< AppEnvironment >;
};

export type AppEnvironmentSyncPreview = {
	__typename?: 'AppEnvironmentSyncPreview';
	backup?: Maybe< AppEnvironmentBackup >;
	canSync?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	config?: Maybe< AppEnvironmentSyncConfig >;
	errors?: Maybe< Array< Maybe< AppEnvironmentSyncError > > >;
	from?: Maybe< AppEnvironment >;
	replacements?: Maybe< Array< Maybe< AppEnvironmentSyncReplacement > > >;
	sourceEnvironment?: Maybe< AppEnvironment >;
	to?: Maybe< AppEnvironment >;
};

export type AppEnvironmentSyncProgress = {
	__typename?: 'AppEnvironmentSyncProgress';
	finished_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	started_at?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	steps?: Maybe< Array< Maybe< AppEnvironmentSyncStep > > >;
	sync?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppEnvironmentSyncReplacement = {
	__typename?: 'AppEnvironmentSyncReplacement';
	from?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	to?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentSyncStep = {
	__typename?: 'AppEnvironmentSyncStep';
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	step?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AppEnvironmentTriggerDbBackupInput = {
	dryRun?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
};

export type AppEnvironmentTriggerDbBackupPayload = {
	__typename?: 'AppEnvironmentTriggerDBBackupPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

/** Variables for the Run WP-CLI Command mutation */
export type AppEnvironmentTriggerWpcliCommandInput = {
	/** The command we want to run. Note: should not include 'wp' */
	command?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The environment ID where we want to run the command */
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	/** The application ID */
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

/** Response from the Run WP-CLI Command mutation */
export type AppEnvironmentTriggerWpcliCommandPayload = {
	__typename?: 'AppEnvironmentTriggerWPCLICommandPayload';
	/** The command that was executed */
	command?: Maybe< WpcliCommand >;
	/** The token for authenticating the socket connection */
	inputToken?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	sshAuthentication?: Maybe< WpCliSshAuthentication >;
};

export type AppEnvironmentUpdateSubsiteDomainInput = {
	domainId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	subsiteId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	subsitePath?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppEnvironmentUpdateSubsiteDomainPayload = {
	__typename?: 'AppEnvironmentUpdateSubsiteDomainPayload';
	app?: Maybe< App >;
	domain?: Maybe< Domain >;
	environment?: Maybe< AppEnvironment >;
};

export type AppEnvironmentUpdateSubsiteDomainStatus = {
	__typename?: 'AppEnvironmentUpdateSubsiteDomainStatus';
	dbOperationInProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	progress?: Maybe< AppEnvironmentStatusProgress >;
	updateSubsiteDomainInProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type AppEnvironmentWpCliStrategy = 'ssh' | 'websocket';

export type AppFeatureInput = {
	context?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type AppFeaturePayload = {
	__typename?: 'AppFeaturePayload';
	features?: Maybe< Array< Maybe< Feature > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AppList = ModelList & {
	__typename?: 'AppList';
	edges?: Maybe< Array< Maybe< App > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< App > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type ApplicationRole = {
	__typename?: 'ApplicationRole';
	extends?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type ApplicationRoleId = 'admin' | 'read' | 'write';

export type ApplicationsResult = {
	__typename?: 'ApplicationsResult';
	items?: Maybe< Array< Maybe< InflatedApplication > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AuditEvent = {
	__typename?: 'AuditEvent';
	actor?: Maybe< AuditEventActor >;
	app?: Maybe< App >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	environment?: Maybe< AppEnvironment >;
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	meta?: Maybe< Array< Maybe< AuditEventMeta > > >;
	recordedTime?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	source?: Maybe< AuditEventSource >;
	target?: Maybe< AuditEventTarget >;
	title?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AuditEventActor = {
	__typename?: 'AuditEventActor';
	avatarUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	isVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	permission?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AuditEventActorAvatarUrlArgs = {
	width?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type AuditEventCount = {
	__typename?: 'AuditEventCount';
	count?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AuditEventList = {
	__typename?: 'AuditEventList';
	edges?: Maybe< Array< Maybe< AuditEvent > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< AuditEvent > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type AuditEventMeta = {
	__typename?: 'AuditEventMeta';
	key: Scalars[ 'String' ][ 'output' ];
	value?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AuditEventSource = {
	__typename?: 'AuditEventSource';
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	version?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type AuditEventTarget = {
	__typename?: 'AuditEventTarget';
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type Backup = {
	__typename?: 'Backup';
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	dataset?: Maybe< DbPartitioningDataset >;
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	filename?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	size?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	sqlDumpTool?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type BackupShippingSchedule = 'Daily' | 'Hourly';

export type BackupsList = {
	__typename?: 'BackupsList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Backup > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type Blueprint = {
	__typename?: 'Blueprint';
	config?: Maybe< Scalars[ 'JSON' ][ 'output' ] >;
	requires_fresh_blueprint?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type Build = Model & {
	__typename?: 'Build';
	commit_author: Scalars[ 'String' ][ 'output' ];
	commit_sha?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commit_time: Scalars[ 'Date' ][ 'output' ];
	finish_date?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	logs?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	queued_date?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	start_date?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	status: BuildStatus;
	vendor_id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

/** Build configuration for the environment */
export type BuildConfiguration = {
	__typename?: 'BuildConfiguration';
	/** Build type */
	buildType: Scalars[ 'String' ][ 'output' ];
	/** Node.js build environment variables */
	nodeBuildDockerEnv: Scalars[ 'String' ][ 'output' ];
	/** Node.js version */
	nodeJSVersion: Scalars[ 'String' ][ 'output' ];
	/** npm token */
	npmToken?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type BuildList = ModelList & {
	__typename?: 'BuildList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Build > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type BuildStatus = 'FAILED' | 'QUEUED' | 'RUNNING' | 'SUCCESS';

export type CsrDecoded = {
	__typename?: 'CSRDecoded';
	altNames?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	commonName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	country?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailAddress?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	locality?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organization?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organizationUnit?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	state?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type CsrInfo = {
	altNames?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
	commonName: Scalars[ 'String' ][ 'input' ];
	country: Scalars[ 'String' ][ 'input' ];
	emailAddress?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	locality: Scalars[ 'String' ][ 'input' ];
	organization: Scalars[ 'String' ][ 'input' ];
	organizationUnit?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	state: Scalars[ 'String' ][ 'input' ];
};

export type CancelEmailVerificationTokenInput = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type CancelInvitationInput = {
	invitationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type CancelInvitationPayload = {
	__typename?: 'CancelInvitationPayload';
	invitation?: Maybe< Invitation >;
};

export type CancelPendingEmailVerificationTokenPayload = {
	__typename?: 'CancelPendingEmailVerificationTokenPayload';
	cancelledToken?: Maybe< Token >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

/** Variables for the Cancel WP-CLI Command mutation */
export type CancelWpcliCommandInput = {
	/** The unique ID for the running command */
	guid?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

/** Response from the Cancel WP-CLI Command mutation */
export type CancelWpcliCommandPayload = {
	__typename?: 'CancelWPCLICommandPayload';
	/** The command that was cancelled */
	command?: Maybe< WpcliCommand >;
};

export type Certificate = {
	__typename?: 'Certificate';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	beginsTimestamp?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	certificateId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Domain name. Ex: www.example.com */
	commonName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	created?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** OpenSSL generated CSR string */
	csr?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	csrDecoded?: Maybe< CsrDecoded >;
	expiresTimestamp?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	hasCertificate?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	issuer?: Maybe< CertificateIssuer >;
	/** Alternative names */
	san?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	valid?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type CertificateIssuer = {
	__typename?: 'CertificateIssuer';
	commonName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	country?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organization?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type CertificateList = {
	__typename?: 'CertificateList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Certificate > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type CloudShippingLogsType = 'edge';

export type CloudShippingObjectStorageConfig =
	| CloudShippingObjectStorageConfigGcp
	| CloudShippingObjectStorageConfigS3;

export type CloudShippingObjectStorageConfigGcp = {
	__typename?: 'CloudShippingObjectStorageConfigGCP';
	gcp_bucket: Scalars[ 'String' ][ 'output' ];
	gcp_credentials_json: Scalars[ 'String' ][ 'output' ];
};

export type CloudShippingObjectStorageConfigGcpInput = {
	gcp_bucket: Scalars[ 'String' ][ 'input' ];
	gcp_credentials_json: Scalars[ 'String' ][ 'input' ];
};

export type CloudShippingObjectStorageConfigS3 = {
	__typename?: 'CloudShippingObjectStorageConfigS3';
	aws_account_id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	s3_bucket: Scalars[ 'String' ][ 'output' ];
	s3_region: Scalars[ 'String' ][ 'output' ];
	s3_shipper_role?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type CloudShippingObjectStorageConfigS3Input = {
	aws_account_id?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	s3_bucket: Scalars[ 'String' ][ 'input' ];
	s3_region: Scalars[ 'String' ][ 'input' ];
	s3_shipper_role?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type CloudShippingObjectStorageProviders = 'aws_s3' | 'gcp_cloud_storage';

/** Variables for the CodebaseChangeRepo mutation */
export type CodebaseChangeRepoInput = {
	/** The unique ID of the Application */
	appId: Scalars[ 'Int' ][ 'input' ];
	/** The new branch name */
	branch: Scalars[ 'String' ][ 'input' ];
	/** The unique ID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type CodebaseChangeRepoResult = {
	__typename?: 'CodebaseChangeRepoResult';
	code?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	message: Scalars[ 'String' ][ 'output' ];
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type CodebaseInfo = {
	__typename?: 'CodebaseInfo';
	plugins: CodebasePlugins;
};

export type CodebasePlugins = {
	__typename?: 'CodebasePlugins';
	pullRequests: Array< CodebasePullRequest >;
	tasks: Array< CodebaseTask >;
	vulnerabilities: Array< CodebaseVulnerability >;
};

export type CodebasePullRequest = {
	__typename?: 'CodebasePullRequest';
	link: Scalars[ 'String' ][ 'output' ];
	modulePath: Scalars[ 'String' ][ 'output' ];
	version: Scalars[ 'String' ][ 'output' ];
};

export type CodebaseTask = {
	__typename?: 'CodebaseTask';
	dateUpdated: Scalars[ 'String' ][ 'output' ];
	failureReason: Scalars[ 'String' ][ 'output' ];
	modulePath: Scalars[ 'String' ][ 'output' ];
	status: Scalars[ 'String' ][ 'output' ];
};

/** Variables for the CodebaseUpdatePlugin mutation */
export type CodebaseUpdatePluginInput = {
	/** The unique ID of the Application */
	appId: Scalars[ 'Int' ][ 'input' ];
	/** The download link for the new plugin version */
	download?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The unique ID of the Environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** The location of the plugin in the codebase */
	location?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The marketplace the plugin belongs too */
	marketplace?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The name of the plugin */
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The plugin slug */
	slug: Scalars[ 'String' ][ 'input' ];
	/** The new version to update the plugin */
	version?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	/** The number of active vulns on the plugin */
	vulnCount?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type CodebaseUpdatePluginResult = {
	__typename?: 'CodebaseUpdatePluginResult';
	code: Scalars[ 'String' ][ 'output' ];
	message: Scalars[ 'String' ][ 'output' ];
	status: Scalars[ 'String' ][ 'output' ];
};

export type CodebaseVulnerability = {
	__typename?: 'CodebaseVulnerability';
	link: Scalars[ 'String' ][ 'output' ];
	modulePath: Scalars[ 'String' ][ 'output' ];
	severity: Scalars[ 'String' ][ 'output' ];
	severityScore?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type CreateCsrInput = {
	clientId: Scalars[ 'Int' ][ 'input' ];
	csr: CsrInfo;
	domainName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type CreateCsrPayload = {
	__typename?: 'CreateCSRPayload';
	certificateId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type CreateInvitationInput = {
	emailAddresses: Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > >;
	grantedPermissions: InvitationPermissionsInput;
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type CreateInvitationPayload = {
	__typename?: 'CreateInvitationPayload';
	invitations?: Maybe< Array< Maybe< Invitation > > >;
};

export type CreateUserInput = {
	githubUsername: Scalars[ 'String' ][ 'input' ];
	isVIP?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type CreateUserPayload = {
	__typename?: 'CreateUserPayload';
	user?: Maybe< User >;
};

export type CustomErrorPageConfig = {
	__typename?: 'CustomErrorPageConfig';
	content?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	strategy: CustomErrorPageConfigStrategy;
	suggestedContentFromRepo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type CustomErrorPageConfigStrategy =
	| 'CUSTOM_FROM_API'
	| 'CUSTOM_FROM_REPOSITORY'
	| 'VIP_DEFAULT';

export type DbBackupCopy = Model & {
	__typename?: 'DBBackupCopy';
	config?: Maybe< DbBackupCopyConfig >;
	filePath: Scalars[ 'String' ][ 'output' ];
	/** id is not implemented by DBBackupCopy as it does not have an integer id */
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type DbBackupCopyConfig = {
	__typename?: 'DBBackupCopyConfig';
	backupLabel: Scalars[ 'String' ][ 'output' ];
	networkSiteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	siteId: Scalars[ 'Int' ][ 'output' ];
	tables: Array< Scalars[ 'String' ][ 'output' ] >;
	userId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type DbBackupCopyList = ModelList & {
	__typename?: 'DBBackupCopyList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes: Array< DbBackupCopy >;
	total: Scalars[ 'Int' ][ 'output' ];
};

export type DbPartitioningDataset = {
	__typename?: 'DBPartitioningDataset';
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type DeactivatePurposeTokenInput = {
	id: Scalars[ 'Int' ][ 'input' ];
	purpose: Scalars[ 'String' ][ 'input' ];
};

export type DeactivatePurposeTokenPayload = {
	__typename?: 'DeactivatePurposeTokenPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DeactivateUserTokenInput = {
	tokenId: Scalars[ 'Int' ][ 'input' ];
};

export type DeactivateUserTokenPayload = {
	__typename?: 'DeactivateUserTokenPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DebugPageCacheInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	pop?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	requestHeaders?: InputMaybe< Array< RequestHeader > >;
	requestMethod?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	url: Scalars[ 'String' ][ 'input' ];
};

export type DebugPageCacheInsight = {
	__typename?: 'DebugPageCacheInsight';
	category: Scalars[ 'String' ][ 'output' ];
	final: Scalars[ 'Boolean' ][ 'output' ];
	html: Scalars[ 'String' ][ 'output' ];
	name: Scalars[ 'String' ][ 'output' ];
	type: Scalars[ 'String' ][ 'output' ];
};

export type DebugPageCachePayload = {
	__typename?: 'DebugPageCachePayload';
	edge?: Maybe< ServerResponse >;
	insights?: Maybe< Array< DebugPageCacheInsight > >;
	origin?: Maybe< ServerResponse >;
	success: Scalars[ 'Boolean' ][ 'output' ];
	url: Scalars[ 'String' ][ 'output' ];
};

export type DecodeCsrInput = {
	csr: Scalars[ 'String' ][ 'input' ];
};

export type DeleteCertificateInput = {
	certificateId: Scalars[ 'Int' ][ 'input' ];
	domainName: Scalars[ 'String' ][ 'input' ];
};

export type DeleteCertificatePayload = {
	__typename?: 'DeleteCertificatePayload';
	deleted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DeleteIdentityProviderInput = {
	id: Scalars[ 'Int' ][ 'input' ];
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type DeleteIdentityProviderPayload = {
	__typename?: 'DeleteIdentityProviderPayload';
	deleted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DeleteMetricThresholdsInput = {
	envId: Scalars[ 'Int' ][ 'input' ];
	eventType: Scalars[ 'String' ][ 'input' ];
	metricName: Scalars[ 'String' ][ 'input' ];
};

export type DeleteMetricThresholdsPayload = {
	__typename?: 'DeleteMetricThresholdsPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
};

export type DeleteNotificationRecipientInput = {
	notificationRecipientId: Scalars[ 'Int' ][ 'input' ];
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type DeleteNotificationRecipientPayload = {
	__typename?: 'DeleteNotificationRecipientPayload';
	deleted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DeleteNotificationSubscriptionInput = {
	notificationSubscriptionId: Scalars[ 'Int' ][ 'input' ];
};

export type DeleteNotificationSubscriptionPayload = {
	__typename?: 'DeleteNotificationSubscriptionPayload';
	deleted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type Deploy = {
	__typename?: 'Deploy';
	branch?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commits?: Maybe< GitCommitList >;
	deployed_at?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	deployer_api_user_id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	repo?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type DeployCommitsArgs = {
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type DeployList = {
	__typename?: 'DeployList';
	edges?: Maybe< Array< Maybe< Deploy > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Deploy > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type Deployment = Model & {
	__typename?: 'Deployment';
	branch: Scalars[ 'String' ][ 'output' ];
	build?: Maybe< Build >;
	cancelledAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	commit_author?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commit_description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commit_sha: Scalars[ 'String' ][ 'output' ];
	commit_time?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	deployment_finished_at?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	deployment_status: Scalars[ 'String' ][ 'output' ];
	deployment_triggered_at?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	inProgress?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	initiatedBy?: Maybe< User >;
	isAvailableForRollback?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isError?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isLatest?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	postDeployActionsJob?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	repo: Scalars[ 'String' ][ 'output' ];
	steps?: Maybe< Array< Maybe< DeploymentStep > > >;
};

export type DeploymentList = ModelList & {
	__typename?: 'DeploymentList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Deployment > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type DeploymentStep = {
	__typename?: 'DeploymentStep';
	finishDate?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	inProgress: Scalars[ 'Boolean' ][ 'output' ];
	isError: Scalars[ 'Boolean' ][ 'output' ];
	isLogsAvailableForAppType?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	logs?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	logsExpireAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	startDate?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	status: DeploymentStepStatus;
	step: Scalars[ 'String' ][ 'output' ];
};

export type DeploymentStepStatus =
	| 'BuildError'
	| 'BuildFinished'
	| 'Building'
	| 'Cancelled'
	| 'Deploying'
	| 'Error'
	| 'Finished'
	| 'Pending'
	| 'Running'
	| 'Waiting';

/** A domain for an environment */
export type Domain = {
	__typename?: 'Domain';
	/** Is the domain currently active? */
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** The active certificate of the domain */
	certificate?: Maybe< Certificate >;
	/** The matching certificates of the domain */
	certificates?: Maybe< CertificateList >;
	/** The date the domain was added to the system */
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** What is the IP of the domain and does it point to VIP? */
	dns?: Maybe< DomainDnsRecord >;
	/** When was the email deliverability last checked? */
	emailDeliverabilityLastCheckedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** The environment this domain belongs to */
	environment?: Maybe< AppEnvironment >;
	/** Does this domain have a valid TLS certificate? (Note: SSL is a misnomer there; we are using TLS certificates.) */
	hasSSL?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** The unique ID for the domain */
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Is this a default domain? (*.go-vip.co / *.go-vip.net) */
	isDefault?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the DKIM record valid? */
	isDkimValid?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the DMARC record valid? */
	isDmarcValid?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the domain using a Let's Encrypt certificate */
	isLetsEncrypt?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is this the primary domain for the environment? */
	isPrimary?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the SPF record valid? */
	isSpfValid?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the domain ownership verified? */
	isVerified?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** What are the issues that may block LE provisioning for this domain? */
	letsEncryptCompatibility?: Maybe< Array< Maybe< DomainLetsEncryptCompatibility > > >;
	/** What is the status of LE provisioning? */
	letsEncryptStatus?: Maybe< Array< Maybe< DomainLetsEncryptStatus > > >;
	/** The domain name (i.e. something like example.com or sub.example.com) */
	name: Scalars[ 'String' ][ 'output' ];
	/** The generated TXT record for the domain */
	verificationCode?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** The wildcard value for the current domain */
	wildcard?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

/** A domain for an environment */
export type DomainCertificatesArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type DomainDnsRecord = {
	__typename?: 'DomainDNSRecord';
	hasVIPHeaders?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	ip?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	isVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type DomainLetsEncryptCompatibility = {
	__typename?: 'DomainLetsEncryptCompatibility';
	actionable?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	code?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	domain?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	explanation?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	isDNSIssue?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isFatal?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	title?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type DomainLetsEncryptStatus = {
	__typename?: 'DomainLetsEncryptStatus';
	broken?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	errorMessage?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	expirationDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	failCount?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	lastErrorDateTime?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	retryDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type DomainList = {
	__typename?: 'DomainList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Domain > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type EdgeConfig = {
	__typename?: 'EdgeConfig';
	accessRestrictions: EdgeConfigAccessRestrictions;
};

export type EdgeConfigAccessRestrictions = {
	__typename?: 'EdgeConfigAccessRestrictions';
	ip?: Maybe< EdgeConfigAccessRestrictionsIp >;
	userAgent?: Maybe< EdgeConfigAccessRestrictionsUserAgent >;
};

export type EdgeConfigAccessRestrictionsIp = {
	__typename?: 'EdgeConfigAccessRestrictionsIp';
	action: EdgeConfigAccessRestrictionsIpAction;
	groups: Array< EdgeConfigAccessRestrictionsIpGroup >;
};

export type EdgeConfigAccessRestrictionsIpAction = 'allow' | 'deny';

export type EdgeConfigAccessRestrictionsIpGroup = {
	__typename?: 'EdgeConfigAccessRestrictionsIpGroup';
	createdAt: Scalars[ 'Date' ][ 'output' ];
	id: Scalars[ 'String' ][ 'output' ];
	ips: Array< Maybe< Scalars[ 'String' ][ 'output' ] > >;
	notes: Scalars[ 'String' ][ 'output' ];
	updatedAt: Scalars[ 'Date' ][ 'output' ];
};

export type EdgeConfigAccessRestrictionsIpGroupInput = {
	id?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	ips: Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > >;
	notes: Scalars[ 'String' ][ 'input' ];
};

export type EdgeConfigAccessRestrictionsUserAgent = {
	__typename?: 'EdgeConfigAccessRestrictionsUserAgent';
	groups?: Maybe< Array< Maybe< EdgeConfigAccessRestrictionsUserAgentGroup > > >;
};

export type EdgeConfigAccessRestrictionsUserAgentGroup = {
	__typename?: 'EdgeConfigAccessRestrictionsUserAgentGroup';
	createdAt: Scalars[ 'Date' ][ 'output' ];
	id: Scalars[ 'String' ][ 'output' ];
	notes: Scalars[ 'String' ][ 'output' ];
	rules: Array< EdgeConfigAccessRestrictionsUserAgentRule >;
	updatedAt: Scalars[ 'Date' ][ 'output' ];
};

export type EdgeConfigAccessRestrictionsUserAgentOperator = 'contains' | 'equals';

export type EdgeConfigAccessRestrictionsUserAgentRule = {
	__typename?: 'EdgeConfigAccessRestrictionsUserAgentRule';
	operator: EdgeConfigAccessRestrictionsUserAgentOperator;
	value: Scalars[ 'String' ][ 'output' ];
};

export type EdgeConfigUpdateIpAccessRestrictionsInput = {
	action: EdgeConfigAccessRestrictionsIpAction;
	environmentId: Scalars[ 'Int' ][ 'input' ];
	groups: Array< InputMaybe< EdgeConfigAccessRestrictionsIpGroupInput > >;
};

export type EdgeConfigUpdateUserAgentAccessRestrictionsInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
	groups: Array< EdgeConfigUpdateUserAgentGroupInput >;
};

export type EdgeConfigUpdateUserAgentGroupInput = {
	id?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	notes: Scalars[ 'String' ][ 'input' ];
	rules: Array< EdgeConfigUpdateUserAgentGroupRuleInput >;
};

export type EdgeConfigUpdateUserAgentGroupRuleInput = {
	operator: EdgeConfigAccessRestrictionsUserAgentOperator;
	value: Scalars[ 'String' ][ 'input' ];
};

export type EmailNotificationRecipient = NotificationRecipient & {
	__typename?: 'EmailNotificationRecipient';
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type EmailVerificationStatus =
	| 'CANCELED'
	| 'EXPIRED'
	| 'LEGACY_UNVERIFIED'
	| 'PENDING'
	| 'UNVERIFIED'
	| 'VERIFIED';

export type EmailVerificationTokenData = {
	__typename?: 'EmailVerificationTokenData';
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	expires?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	status?: Maybe< EmailVerificationStatus >;
};

export type EmailVerificationTokenPayload = {
	__typename?: 'EmailVerificationTokenPayload';
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	expiresAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type EnableIdentityProviderEncryptionInput = {
	identityProviderId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type EnableIdentityProviderEncryptionPayload = {
	__typename?: 'EnableIdentityProviderEncryptionPayload';
	identityProvider?: Maybe< IdentityProvider >;
};

export type EnablePhpMyAdminInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type EnablePhpMyAdminPayload = {
	__typename?: 'EnablePhpMyAdminPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type Environment = {
	__typename?: 'Environment';
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

/** Customer-provided environment variable / constant */
export type EnvironmentVariable = {
	__typename?: 'EnvironmentVariable';
	/** Environment variable name */
	name: Scalars[ 'String' ][ 'output' ];
	/** Environment variable value */
	value?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type EnvironmentVariableInput = {
	/** The unique ID of the Application */
	applicationId: Scalars[ 'Int' ][ 'input' ];
	/** The unique ID of the environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** Environment variable name (must consist of uppercase letters, numbers, and underscore */
	name: Scalars[ 'String' ][ 'input' ];
	/** Environment variable value */
	value: Scalars[ 'String' ][ 'input' ];
};

/** Customer-provided environment variables / constants */
export type EnvironmentVariablesList = {
	__typename?: 'EnvironmentVariablesList';
	/** The environment variables for this environment */
	nodes?: Maybe< Array< Maybe< EnvironmentVariable > > >;
	/** The total number of environment variables for this environment */
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type EnvironmentVariablesPayload = {
	__typename?: 'EnvironmentVariablesPayload';
	environmentVariables?: Maybe< EnvironmentVariablesList >;
};

export type Feature = Model & {
	__typename?: 'Feature';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	context?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GenerateCustomDeployAccessInput = {
	environmentIds?: InputMaybe< Array< Scalars[ 'Int' ][ 'input' ] > >;
};

export type GenerateCustomDeployAccessPayload = {
	__typename?: 'GenerateCustomDeployAccessPayload';
	expiresAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	token?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GenerateEmailVerificationTokenInput = {
	email: Scalars[ 'String' ][ 'input' ];
};

export type GenerateGoogleSheetsAccessTokenInput = {
	credentials: GoogleSheetsCredentialsInput;
};

export type GenerateGoogleSheetsAccessTokenPayload = {
	__typename?: 'GenerateGoogleSheetsAccessTokenPayload';
	accessToken: Scalars[ 'String' ][ 'output' ];
	expiresAt?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type GeneratePhpMyAdminAccessInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
};

export type GeneratePhpMyAdminAccessPayload = {
	__typename?: 'GeneratePhpMyAdminAccessPayload';
	expiresAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GetIntegrationInput = {
	inflate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	networkSiteId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	slug: Scalars[ 'String' ][ 'input' ];
};

export type GitActor = {
	__typename?: 'GitActor';
	avatarUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< GitHubUser >;
};

export type GitActorAvatarUrlArgs = {
	size?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type GitCommit = {
	__typename?: 'GitCommit';
	abbreviatedOid?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	additions?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	author?: Maybe< GitActor >;
	authoredDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	committedDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	deletions?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	messageBody?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	messageBodyHTML?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	messageHeadline?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	messageHeadlineHTML?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	oid?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GitCommitList = {
	__typename?: 'GitCommitList';
	edges?: Maybe< Array< Maybe< GitCommit > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< GitCommit > > >;
};

export type GitHubComment = {
	__typename?: 'GitHubComment';
	body?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'ID' ][ 'output' ] >;
	issueUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< GitHubUser >;
};

export type GitHubPullRequest = Model & {
	__typename?: 'GitHubPullRequest';
	assignee?: Maybe< GitHubUser >;
	assignees?: Maybe< Array< Maybe< GitHubUser > > >;
	body?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	closedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	comments?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	commentsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commitsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	eventsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	initialCommit?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	labels?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	labelsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	locked?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	number?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	repositoryUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	title?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	totalCommits?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< GitHubUser >;
	vipMeta?: Maybe< VipprMeta >;
};

export type GitHubPullRequestList = ModelList & {
	__typename?: 'GitHubPullRequestList';
	edges?: Maybe< Array< Maybe< GitHubPullRequest > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< GitHubPullRequest > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type GitHubPullRequestReviewComment = {
	__typename?: 'GitHubPullRequestReviewComment';
	body?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commitId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	diffHunk?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'ID' ][ 'output' ] >;
	originalCommitId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	originalPosition?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	path?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	position?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	pullRequestUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	pullRequest_review_id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< GitHubUser >;
};

export type GitHubReview = {
	__typename?: 'GitHubReview';
	body?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	commitId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'ID' ][ 'output' ] >;
	pullRequestUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	state?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	submittedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< GitHubUser >;
};

export type GitHubUser = {
	__typename?: 'GitHubUser';
	avatarUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	eventsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	followersUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	followingUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	gistsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	gravatarId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'ID' ][ 'output' ] >;
	login?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organizationsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	receivedEventsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	reposUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	siteAdmin?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	starredUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	subscriptionsUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GitRepository = {
	__typename?: 'GitRepository';
	fullName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	htmlUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organization?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	platform?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type GoogleChatNotificationRecipient = NotificationRecipient & {
	__typename?: 'GoogleChatNotificationRecipient';
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type GoogleSheetsCredentialsInput = {
	auth_provider_x509_cert_url: Scalars[ 'String' ][ 'input' ];
	auth_uri: Scalars[ 'String' ][ 'input' ];
	client_email: Scalars[ 'String' ][ 'input' ];
	client_id: Scalars[ 'String' ][ 'input' ];
	client_x509_cert_url: Scalars[ 'String' ][ 'input' ];
	private_key: Scalars[ 'String' ][ 'input' ];
	private_key_id: Scalars[ 'String' ][ 'input' ];
	project_id: Scalars[ 'String' ][ 'input' ];
	token_uri: Scalars[ 'String' ][ 'input' ];
	type: Scalars[ 'String' ][ 'input' ];
	universe_domain: Scalars[ 'String' ][ 'input' ];
};

export type IdentityProvider = Model & {
	__typename?: 'IdentityProvider';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	callbackURL?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	certificate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	certificateExpiryDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	dashboardLoginURL?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	entryPoint?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	firstSuccessfulLogin?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	issuer?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	metadataXML?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	organizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	provider?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	secondaryCertificate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	secondaryCertificateExpiryDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	signingCertificateExpiryDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	signingCertificatePublicKey?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	slug?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type IdentityProviderList = ModelList & {
	__typename?: 'IdentityProviderList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< IdentityProvider > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type InflatedApplication = {
	__typename?: 'InflatedApplication';
	environments?: Maybe< Array< Maybe< Environment > > >;
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	is_multisite?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type InflatedNetworkSite = {
	__typename?: 'InflatedNetworkSite';
	config?: Maybe< Scalars[ 'JSON' ][ 'output' ] >;
	home_url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type Integration = {
	__typename?: 'Integration';
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	applications?: Maybe< ApplicationsResult >;
	config?: Maybe< Scalars[ 'JSON' ][ 'output' ] >;
	envId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	network_site?: Maybe< NetworkSiteResult >;
	network_sites?: Maybe< NetworkSitesResult >;
	orgId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	requiredBy: Array< Scalars[ 'String' ][ 'output' ] >;
	requires: Array< Scalars[ 'String' ][ 'output' ] >;
	slug: Scalars[ 'String' ][ 'output' ];
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type IntegrationApplicationsArgs = {
	limit?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	page?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type IntegrationNetwork_SitesArgs = {
	limit?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	page?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	search?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	status?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type IntegrationCenter = Model & {
	__typename?: 'IntegrationCenter';
	allowedSiteTypes: Array< Scalars[ 'Int' ][ 'output' ] >;
	blocks: Scalars[ 'String' ][ 'output' ];
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	meta: Scalars[ 'String' ][ 'output' ];
	requiredBy: Array< Scalars[ 'String' ][ 'output' ] >;
	requires: Array< Scalars[ 'String' ][ 'output' ] >;
	slug: Scalars[ 'String' ][ 'output' ];
	title: Scalars[ 'String' ][ 'output' ];
	visibility: Scalars[ 'String' ][ 'output' ];
};

export type IntegrationCenterCategory = {
	__typename?: 'IntegrationCenterCategory';
	name: Scalars[ 'String' ][ 'output' ];
	slug: Scalars[ 'String' ][ 'output' ];
};

export type IntegrationCenterCategoryList = {
	__typename?: 'IntegrationCenterCategoryList';
	nodes?: Maybe< Array< Maybe< IntegrationCenterCategory > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type IntegrationCenterList = ModelList & {
	__typename?: 'IntegrationCenterList';
	edges?: Maybe< Array< Maybe< IntegrationCenter > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< IntegrationCenter > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type IntegrationClientList = {
	__typename?: 'IntegrationClientList';
	nodes: Array< IntegrationClientListItem >;
	total: Scalars[ 'Int' ][ 'output' ];
};

export type IntegrationClientListItem = {
	__typename?: 'IntegrationClientListItem';
	has_active_apps?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	must_use?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	requiredBy: Array< Scalars[ 'String' ][ 'output' ] >;
	requires: Array< Scalars[ 'String' ][ 'output' ] >;
	slug: Scalars[ 'String' ][ 'output' ];
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	visibility?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type IntegrationDevEnvConfig = {
	__typename?: 'IntegrationDevEnvConfig';
	data?: Maybe< Scalars[ 'JSON' ][ 'output' ] >;
};

export type IntegrationList = {
	__typename?: 'IntegrationList';
	nodes: Array< IntegrationListItem >;
	total: Scalars[ 'Int' ][ 'output' ];
};

export type IntegrationListItem = {
	__typename?: 'IntegrationListItem';
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	must_use?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	requiredBy: Array< Scalars[ 'String' ][ 'output' ] >;
	requires: Array< Scalars[ 'String' ][ 'output' ] >;
	slug: Scalars[ 'String' ][ 'output' ];
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	visibility?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type Invitation = Model & {
	__typename?: 'Invitation';
	acceptedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailAddress?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	expiresAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	grantedPermissions?: Maybe< InvitationPermissions >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	invitingUser?: Maybe< User >;
	isCancelable?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isResendable?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	organization?: Maybe< Organization >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type InvitationList = {
	__typename?: 'InvitationList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Invitation > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type InvitationPermissions = {
	__typename?: 'InvitationPermissions';
	applicationRoles?: Maybe< Array< Maybe< InvitationPermissionsApplicationRole > > >;
	organizationRoleId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type InvitationPermissionsApplicationRole = {
	__typename?: 'InvitationPermissionsApplicationRole';
	app?: Maybe< App >;
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	role?: Maybe< ApplicationRole >;
	roleId?: Maybe< ApplicationRoleId >;
};

export type InvitationPermissionsApplicationRoleInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	roleId?: InputMaybe< ApplicationRoleId >;
};

export type InvitationPermissionsInput = {
	applicationRoles?: InputMaybe< Array< InputMaybe< InvitationPermissionsApplicationRoleInput > > >;
	organizationRoleId?: InputMaybe< OrgRoleId >;
};

export type Job = JobInterface & {
	__typename?: 'Job';
	completedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	inProgressLock?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	metadata?: Maybe< Array< Maybe< JobMetadata > > >;
	progress?: Maybe< JobProgress >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type JobInterface = {
	completedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	inProgressLock?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	metadata?: Maybe< Array< Maybe< JobMetadata > > >;
	progress?: Maybe< JobProgress >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type JobMetadata = {
	__typename?: 'JobMetadata';
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	value?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type JobProgress = {
	__typename?: 'JobProgress';
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	steps?: Maybe< Array< Maybe< JobProgressStep > > >;
};

export type JobProgressStep = {
	__typename?: 'JobProgressStep';
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	step?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type LiveBackupCopy = {
	__typename?: 'LiveBackupCopy';
	config: LiveBackupCopyConfig;
	copyId: Scalars[ 'String' ][ 'output' ];
	createdAt: Scalars[ 'Date' ][ 'output' ];
	error?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	expiresAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	finishedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	status: LiveBackupCopyStatus;
};

export type LiveBackupCopyConfig = {
	__typename?: 'LiveBackupCopyConfig';
	subsiteIds?: Maybe< Array< Scalars[ 'Int' ][ 'output' ] > >;
	tables?: Maybe< Array< LiveBackupCopyTableConfig > >;
	tool: LiveBackupCopyTool;
	type: LiveBackupCopyType;
	wpcliCommand?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type LiveBackupCopyConfigInput = {
	environmentId: Scalars[ 'Int' ][ 'input' ];
	id: Scalars[ 'Int' ][ 'input' ];
	subsiteIds?: InputMaybe< Array< Scalars[ 'Int' ][ 'input' ] > >;
	tables?: InputMaybe< Array< LiveBackupCopyTableConfigInput > >;
	tool: LiveBackupCopyTool;
	type: LiveBackupCopyType;
	wpcliCommand?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type LiveBackupCopyStatus = 'completed' | 'failed' | 'in_progress' | 'pending';

export type LiveBackupCopyTableConfig = {
	__typename?: 'LiveBackupCopyTableConfig';
	options?: Maybe< Array< LiveBackupCopyTableOptionConfig > >;
	table: Scalars[ 'String' ][ 'output' ];
};

export type LiveBackupCopyTableConfigInput = {
	options?: InputMaybe< Array< LiveBackupCopyTableOptionConfigInput > >;
	table: Scalars[ 'String' ][ 'input' ];
};

export type LiveBackupCopyTableOptionConfig = {
	__typename?: 'LiveBackupCopyTableOptionConfig';
	key: Scalars[ 'String' ][ 'output' ];
	value: Scalars[ 'String' ][ 'output' ];
};

export type LiveBackupCopyTableOptionConfigInput = {
	key: Scalars[ 'String' ][ 'input' ];
	value: Scalars[ 'String' ][ 'input' ];
};

export type LiveBackupCopyTool = 'mydumper' | 'mysqldump';

export type LiveBackupCopyType = 'full' | 'subsite_ids' | 'tables' | 'wpcli_command';

export type ManageIntegrationInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	applyToChildEnvironments?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	config?: InputMaybe< Scalars[ 'JSON' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	networkId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	slug: Scalars[ 'String' ][ 'input' ];
	status: Scalars[ 'String' ][ 'input' ];
};

export type Me = {
	__typename?: 'Me';
	applicationRoles?: Maybe< UserApplicationRoleList >;
	auth0Id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	authMethod?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	currentIP?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailAddress?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailVerification?: Maybe< EmailVerificationTokenData >;
	githubUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	isConsideredInactive?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isEmailLegacyUnverified?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isEmailVerified?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isVipAuthUser?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	lastSeenAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	mfaMethods?: Maybe< MfaMethods >;
	organizationRoles?: Maybe< UserOrganizationRoleList >;
	samlIdentityProviderName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	samlNameId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	samlOrganizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	shouldBeVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	tokens?: Maybe< Array< Maybe< Token > > >;
	trackingUserId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	vipAuthId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	wpcomUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type MeApplicationRolesArgs = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type MeOrganizationRolesArgs = {
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type MediaExport = {
	__typename?: 'MediaExport';
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	error?: Maybe< MediaExportError >;
	expiresAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	filesProcessed?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	filesTotal?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	subsite?: Maybe< WpSite >;
	totalArchiveFiles?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	totalSizeInBytes?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	user?: Maybe< WpcliCommandUser >;
};

export type MediaExportError = {
	__typename?: 'MediaExportError';
	globalErrors?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	hasFileErrors?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type MediaExportsList = {
	__typename?: 'MediaExportsList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< MediaExport > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

/** Media Import Configuration */
export type MediaImportConfig = {
	__typename?: 'MediaImportConfig';
	/** Allowed File Types */
	allowedFileTypes?: Maybe< Scalars[ 'MediaImportAllowedFileTypes' ][ 'output' ] >;
	/** Allowed File Name Length */
	fileNameCharCount?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Allowed File Size Limit */
	fileSizeLimitInBytes?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type MetricAnomaliesList = {
	__typename?: 'MetricAnomaliesList';
	anomalies: Array< Maybe< MetricAnomaly > >;
	environmentId: Scalars[ 'Int' ][ 'output' ];
	metricName: Scalars[ 'String' ][ 'output' ];
	queryId: Scalars[ 'String' ][ 'output' ];
	siteId: Scalars[ 'Int' ][ 'output' ];
	totalAnomalies: Scalars[ 'Int' ][ 'output' ];
};

export type MetricAnomaly = {
	__typename?: 'MetricAnomaly';
	algorithmVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	customMetricThresholdsConfigId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	endTime?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	endValue?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	startTime: Scalars[ 'String' ][ 'output' ];
	startValue?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
};

export type MetricAnomalyContext = {
	__typename?: 'MetricAnomalyContext';
	algorithmVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	data?: Maybe< AnomalyContextData >;
	endTime?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	endValue?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	startTime?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	startValue?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
};

export type MetricMeasurement = {
	__typename?: 'MetricMeasurement';
	baseline?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
	isAnomalous?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	timestamp: Scalars[ 'String' ][ 'output' ];
	value?: Maybe< Scalars[ 'Float' ][ 'output' ] >;
};

export type MetricThreshold = {
	__typename?: 'MetricThreshold';
	id: Scalars[ 'Int' ][ 'output' ];
	metricName: Scalars[ 'String' ][ 'output' ];
	operator: Scalars[ 'String' ][ 'output' ];
	value: Scalars[ 'Float' ][ 'output' ];
};

export type MetricThresholdInput = {
	operator: Scalars[ 'String' ][ 'input' ];
	value: Scalars[ 'Float' ][ 'input' ];
};

export type MfaMethods = {
	__typename?: 'MfaMethods';
	configuredMethods?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	preferredMethod?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type MicrosoftTeamsNotificationRecipient = NotificationRecipient & {
	__typename?: 'MicrosoftTeamsNotificationRecipient';
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type Model = {
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type ModelList = {
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Model > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type Mutation = {
	__typename?: 'Mutation';
	abortMediaImport: AppEnvironmentAbortMediaImportPayload;
	/** Accept an invitation to an organization */
	acceptInvitation: AcceptInvitationPayload;
	activateCertificate: ActivateCertificatePayload;
	/** Activate a certificate for all domains on a site */
	activateCertificateBySite?: Maybe< ActivateCertificateBySitePayload >;
	/** Activate a Let's Encrypt TLS certificate for a domain */
	activateLetsEncryptOnDomainForAppEnvironment: AppEnvironmentActivateLetsEncryptOnDomainPayload;
	addBasicAuth: AppEnvironmentBasicAuthPayload;
	addCertificate: AddCertificatePayload;
	/** Add a domain to an environment */
	addDomainToAppEnvironment: AppEnvironmentAddDomainPayload;
	addEnvironmentVariable?: Maybe< EnvironmentVariablesPayload >;
	addNewRelicUser?: Maybe< AppEnvironmentAddNewRelicUserPayload >;
	addNotificationRecipient?: Maybe< AddNotificationRecipientPayload >;
	addNotificationSubscription: AddNotificationSubscriptionPayload;
	/** Request stats */
	addRequestStats?: Maybe< AppEnvironmentAddRequestStatsPayload >;
	/** Cancel an invitation to an organization */
	cancelInvitation: CancelInvitationPayload;
	cancelPendingEmailVerificationToken: CancelPendingEmailVerificationTokenPayload;
	/** Stop a running WP-CLI command */
	cancelWPCLICommand: CancelWpcliCommandPayload;
	/** Repository Management */
	changeRepo: CodebaseChangeRepoResult;
	createCSR: CreateCsrPayload;
	/** Invite a user to an organization */
	createInvitation: CreateInvitationPayload;
	createUser: CreateUserPayload;
	/** Remove a domain from an environment */
	deactivateDomainOnAppEnvironment: AppEnvironmentDeactivateDomainPayload;
	/** Purpose Token Management */
	deactivatePurposeToken: DeactivatePurposeTokenPayload;
	deactivateUserToken: DeactivateUserTokenPayload;
	/** Debug page cache object */
	debugPageCache: DebugPageCachePayload;
	decodeCSR: CsrDecoded;
	/** @deprecated Use `deleteBackupShippingConfigV2` instead. */
	deleteBackupShippingConfig: AppEnvironmentBackupShippingPayload;
	deleteBackupShippingConfigV2: AppEnvironmentBackupShippingOperationResultPayload;
	deleteBasicAuth: AppEnvironmentBasicAuthPayload;
	deleteCertificate: DeleteCertificatePayload;
	deleteEnvironmentVariable?: Maybe< EnvironmentVariablesPayload >;
	deleteIdentityProvider: DeleteIdentityProviderPayload;
	/** @deprecated Use `deleteLogShippingConfigV2` instead. */
	deleteLogShippingConfig: AppEnvironmentLogShippingPayload;
	deleteLogShippingConfigV2: AppEnvironmentLogShippingOperationResultPayload;
	deleteMetricThresholds?: Maybe< DeleteMetricThresholdsPayload >;
	deleteNewRelicUser?: Maybe< AppEnvironmentDeleteNewRelicUserPayload >;
	deleteNotificationRecipient: DeleteNotificationRecipientPayload;
	deleteNotificationSubscription: DeleteNotificationSubscriptionPayload;
	deleteOrganizationAuthDomain: OrganizationAuthDomainDeletePayload;
	/** @deprecated Use `disableBackupShippingV2` instead. */
	disableBackupShipping: AppEnvironmentBackupShippingPayload;
	disableCustomDeploy?: Maybe< AppEnvironmentEnableDisableCustomDeployPayload >;
	disableEnforceSSOAccess: Scalars[ 'Boolean' ][ 'output' ];
	disableFeature?: Maybe< AppFeaturePayload >;
	disableIdentityProviderEncryption: EnableIdentityProviderEncryptionPayload;
	/** @deprecated Use `updateLogShippingStatusV2` instead. */
	disableLogShipping: AppEnvironmentLogShippingPayload;
	disableNewRelic?: Maybe< AppEnvironmentDisableNewRelicPayload >;
	editBasicAuth: AppEnvironmentBasicAuthPayload;
	/** @deprecated Use `enableBackupShippingV2` instead. */
	enableBackupShipping: AppEnvironmentBackupShippingPayload;
	enableCustomDeploy?: Maybe< AppEnvironmentEnableDisableCustomDeployPayload >;
	/** Enforce SSO Access */
	enableEnforceSSOAccess: Scalars[ 'Boolean' ][ 'output' ];
	enableFeature?: Maybe< AppFeaturePayload >;
	enableIdentityProviderEncryption: EnableIdentityProviderEncryptionPayload;
	enableLaunchMode?: Maybe< AppEnvironmentEnableLaunchModePayload >;
	/** @deprecated Use `updateLogShippingStatusV2` instead. */
	enableLogShipping: AppEnvironmentLogShippingPayload;
	enableNewRelic?: Maybe< AppEnvironmentEnableNewRelicPayload >;
	enablePHPMyAdmin?: Maybe< EnablePhpMyAdminPayload >;
	generateCustomDeployAccess?: Maybe< GenerateCustomDeployAccessPayload >;
	/** Generate a presigned download URL to a previously copied database backup */
	generateDBBackupCopyUrl?: Maybe< AppEnvironmentGenerateDbBackupCopyUrlPayload >;
	/** Email Verification Token Management */
	generateEmailVerificationToken: EmailVerificationTokenPayload;
	generateGoogleSheetsAccessToken: GenerateGoogleSheetsAccessTokenPayload;
	generateLiveBackupCopyDownloadURL?: Maybe< AppEnvironmentLiveBackupCopyDownloadUrlPayload >;
	generateMediaExportSignedUrl?: Maybe< AppEnvironmentGenerateMediaExportSignedUrlPayload >;
	/** PhpMyAdmin */
	generatePHPMyAdminAccess?: Maybe< GeneratePhpMyAdminAccessPayload >;
	generateUserToken: UserTokenGenerationPayload;
	launchApplication?: Maybe< AppEnvironmentLaunchedPayload >;
	/** Manage Integration */
	manageIntegration?: Maybe< Integration >;
	/** Purge page cache object(s) */
	purgePageCache: PurgePageCachePayload;
	/** Remove a user from an organization (removes all roles and applications permissions) */
	removeUserFromOrganization: RemoveUserFromOrganizationPayload;
	replaceOrganizationAuthDomains: OrganizationAuthDomainReplacePayload;
	requestFeatureUpgrade?: Maybe< RequestFeatureUpgradePayload >;
	/** Resend an invitation to an organization */
	resendInvitation: ResendInvitationPayload;
	/** Retire a non-production environment */
	retireEnvironment: AppEnvironmentRetirePayload;
	rollback: RollbackPayload;
	saveIdentityProvider: SaveIdentityProviderPayload;
	saveOrganizationAuthDomain: OrganizationAuthDomainPayload;
	sendTestNotification: SendTestNotificationPayload;
	setIdentityProviderValidations: SetIdentityProviderValidationsPayload;
	/** Custom Metric Thresholds management */
	setMetricThresholds?: Maybe< SetOrUpdateMetricThresholdPayload >;
	setUserApplicationRoles: SetUserApplicationRolesPayload;
	setUserOrganizationRole: UpdateUserOrganizationRolePayload;
	startCustomDeploy?: Maybe< AppEnvironmentCustomDeployPayload >;
	startDBBackupCopy: AppEnvironmentStartDbBackupCopyPayload;
	startImport: AppEnvironmentImportPayload;
	startLiveBackupCopy: AppEnvironmentStartLiveBackupCopyPayload;
	startMediaExport?: Maybe< StartMediaExportPayload >;
	/** Import Media into your Production Environment */
	startMediaImport?: Maybe< AppEnvironmentMediaImportPayload >;
	/** Switch the primary domain for an environment */
	switchEnvironmentPrimaryDomain: AppEnvironmentPrimaryDomainSwitchPayload;
	syncEnvironment: AppEnvironmentSyncPayload;
	toggleVIPStatus: ToggleUserVipStatusPayload;
	triggerDatabaseBackup: AppEnvironmentTriggerDbBackupPayload;
	/** Execute a WP-CLI command on an environment */
	triggerWPCLICommandOnAppEnvironment: AppEnvironmentTriggerWpcliCommandPayload;
	/** @deprecated Use `updateBackupShippingConfigV2` instead. */
	updateBackupShippingConfig: AppEnvironmentBackupShippingPayload;
	updateBackupShippingConfigV2: AppEnvironmentBackupShippingOperationResultPayload;
	updateBackupShippingStatusV2: AppEnvironmentBackupShippingOperationResultPayload;
	updateCertificate: UpdateCertificatePayload;
	updateCustomErrorPageConfig: CustomErrorPageConfig;
	updateEnvironmentSubsiteDomain: AppEnvironmentUpdateSubsiteDomainPayload;
	updateEnvironmentVariable?: Maybe< EnvironmentVariablesPayload >;
	/** HSTS Settings */
	updateHSTSSettings?: Maybe< AppEnvironmentHstsSettingsPayload >;
	updateIPAccessRestrictions?: Maybe< EdgeConfigAccessRestrictionsIp >;
	/** @deprecated Use `validateLogShippingConfigV2` instead. */
	updateLogShippingConfig: AppEnvironmentLogShippingPayload;
	updateLogShippingConfigV2: AppEnvironmentLogShippingOperationResultPayload;
	updateLogShippingStatusV2: AppEnvironmentLogShippingOperationResultPayload;
	updateMetricThresholds?: Maybe< SetOrUpdateMetricThresholdPayload >;
	updateNotificationRecipient: UpdateNotificationRecipientPayload;
	updateNotificationSubscription: UpdateNotificationSubscriptionPayload;
	/** Plugin Update */
	updatePlugin: CodebaseUpdatePluginResult;
	updateSoftwareSettings?: Maybe< AppEnvironmentSoftwareSettings >;
	/** Update a user's GitHub username or email address */
	updateUser: UpdateUserPayload;
	updateUserAgentAccessRestrictions?: Maybe< EdgeConfigAccessRestrictionsUserAgent >;
	updateWPSiteLaunchStatus: WpSiteLaunchStatusPayload;
	validateBackupShippingConfigV2: AppEnvironmentBackupShippingOperationResultPayload;
	validateCustomDeployAccess?: Maybe< ValidateCustomDeployAccessPayload >;
	validateEmailVerificationToken: ValidateEmailVerificationTokenPayload;
	validateLogShippingConfig: AppEnvironmentLogShippingValidationPayload;
	validateLogShippingConfigV2: AppEnvironmentLogShippingOperationResultPayload;
	validatePHPMyAdminAccess?: Maybe< ValidatePhpMyAdminAccessPayload >;
	/** Verify a DNS TXT record */
	verifyDnsTxtRecord: VerifyDnsTxtRecordPayload;
};

export type MutationAbortMediaImportArgs = {
	input?: InputMaybe< AppEnvironmentAbortMediaImportInput >;
};

export type MutationAcceptInvitationArgs = {
	input?: InputMaybe< AcceptInvitationInput >;
};

export type MutationActivateCertificateArgs = {
	input?: InputMaybe< ActivateCertificateInput >;
};

export type MutationActivateCertificateBySiteArgs = {
	input?: InputMaybe< ActivateCertificateBySiteInput >;
};

export type MutationActivateLetsEncryptOnDomainForAppEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentActivateLetsEncryptOnDomainInput >;
};

export type MutationAddBasicAuthArgs = {
	input?: InputMaybe< AppEnvironmentBasicAuthInput >;
};

export type MutationAddCertificateArgs = {
	input?: InputMaybe< AddCertificateInput >;
};

export type MutationAddDomainToAppEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentAddDomainInput >;
};

export type MutationAddEnvironmentVariableArgs = {
	input?: InputMaybe< EnvironmentVariableInput >;
};

export type MutationAddNewRelicUserArgs = {
	input?: InputMaybe< AppEnvironmentAddNewRelicUserInput >;
};

export type MutationAddNotificationRecipientArgs = {
	input?: InputMaybe< AddNotificationRecipientInput >;
};

export type MutationAddNotificationSubscriptionArgs = {
	input?: InputMaybe< AddNotificationSubscriptionInput >;
};

export type MutationAddRequestStatsArgs = {
	input?: InputMaybe< AppEnvironmentAddRequestStatsInput >;
};

export type MutationCancelInvitationArgs = {
	input?: InputMaybe< CancelInvitationInput >;
};

export type MutationCancelPendingEmailVerificationTokenArgs = {
	input?: InputMaybe< CancelEmailVerificationTokenInput >;
};

export type MutationCancelWpcliCommandArgs = {
	input?: InputMaybe< CancelWpcliCommandInput >;
};

export type MutationChangeRepoArgs = {
	input?: InputMaybe< CodebaseChangeRepoInput >;
};

export type MutationCreateCsrArgs = {
	input?: InputMaybe< CreateCsrInput >;
};

export type MutationCreateInvitationArgs = {
	input?: InputMaybe< CreateInvitationInput >;
};

export type MutationCreateUserArgs = {
	input?: InputMaybe< CreateUserInput >;
};

export type MutationDeactivateDomainOnAppEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentDeactivateDomainInput >;
};

export type MutationDeactivatePurposeTokenArgs = {
	input?: InputMaybe< DeactivatePurposeTokenInput >;
};

export type MutationDeactivateUserTokenArgs = {
	input?: InputMaybe< DeactivateUserTokenInput >;
};

export type MutationDebugPageCacheArgs = {
	input?: InputMaybe< DebugPageCacheInput >;
};

export type MutationDecodeCsrArgs = {
	input?: InputMaybe< DecodeCsrInput >;
};

export type MutationDeleteBackupShippingConfigArgs = {
	input?: InputMaybe< AppEnvironmentBackupShippingInput >;
};

export type MutationDeleteBackupShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentBackupShippingDeleteInput >;
};

export type MutationDeleteBasicAuthArgs = {
	input?: InputMaybe< AppEnvironmentBasicAuthDeleteInput >;
};

export type MutationDeleteCertificateArgs = {
	input?: InputMaybe< DeleteCertificateInput >;
};

export type MutationDeleteEnvironmentVariableArgs = {
	input?: InputMaybe< EnvironmentVariableInput >;
};

export type MutationDeleteIdentityProviderArgs = {
	input?: InputMaybe< DeleteIdentityProviderInput >;
};

export type MutationDeleteLogShippingConfigArgs = {
	input?: InputMaybe< AppEnvironmentLogShippingInput >;
};

export type MutationDeleteLogShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentLogShippingDeleteInput >;
};

export type MutationDeleteMetricThresholdsArgs = {
	input?: InputMaybe< DeleteMetricThresholdsInput >;
};

export type MutationDeleteNewRelicUserArgs = {
	input?: InputMaybe< AppEnvironmentDeleteNewRelicUserInput >;
};

export type MutationDeleteNotificationRecipientArgs = {
	input?: InputMaybe< DeleteNotificationRecipientInput >;
};

export type MutationDeleteNotificationSubscriptionArgs = {
	input?: InputMaybe< DeleteNotificationSubscriptionInput >;
};

export type MutationDeleteOrganizationAuthDomainArgs = {
	input?: InputMaybe< OrganizationAuthDomainDeleteInput >;
};

export type MutationDisableBackupShippingArgs = {
	input?: InputMaybe< AppEnvironmentBackupShippingInput >;
};

export type MutationDisableCustomDeployArgs = {
	input?: InputMaybe< AppEnvironmentEnableDisableCustomDeployInput >;
};

export type MutationDisableEnforceSsoAccessArgs = {
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type MutationDisableFeatureArgs = {
	input?: InputMaybe< AppFeatureInput >;
};

export type MutationDisableIdentityProviderEncryptionArgs = {
	input?: InputMaybe< EnableIdentityProviderEncryptionInput >;
};

export type MutationDisableLogShippingArgs = {
	input?: InputMaybe< AppEnvironmentLogShippingInput >;
};

export type MutationDisableNewRelicArgs = {
	input?: InputMaybe< AppEnvironmentDisableNewRelicInput >;
};

export type MutationEditBasicAuthArgs = {
	input?: InputMaybe< AppEnvironmentBasicAuthInput >;
};

export type MutationEnableBackupShippingArgs = {
	input?: InputMaybe< AppEnvironmentBackupShippingInput >;
};

export type MutationEnableCustomDeployArgs = {
	input?: InputMaybe< AppEnvironmentEnableDisableCustomDeployInput >;
};

export type MutationEnableEnforceSsoAccessArgs = {
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type MutationEnableFeatureArgs = {
	input?: InputMaybe< AppFeatureInput >;
};

export type MutationEnableIdentityProviderEncryptionArgs = {
	input?: InputMaybe< EnableIdentityProviderEncryptionInput >;
};

export type MutationEnableLaunchModeArgs = {
	input?: InputMaybe< AppEnvironmentEnableLaunchModeInput >;
};

export type MutationEnableLogShippingArgs = {
	input?: InputMaybe< AppEnvironmentLogShippingInput >;
};

export type MutationEnableNewRelicArgs = {
	input?: InputMaybe< AppEnvironmentEnableNewRelicInput >;
};

export type MutationEnablePhpMyAdminArgs = {
	input?: InputMaybe< EnablePhpMyAdminInput >;
};

export type MutationGenerateCustomDeployAccessArgs = {
	input?: InputMaybe< GenerateCustomDeployAccessInput >;
};

export type MutationGenerateDbBackupCopyUrlArgs = {
	input?: InputMaybe< AppEnvironmentGenerateDbBackupCopyUrlInput >;
};

export type MutationGenerateEmailVerificationTokenArgs = {
	input: GenerateEmailVerificationTokenInput;
};

export type MutationGenerateGoogleSheetsAccessTokenArgs = {
	input: GenerateGoogleSheetsAccessTokenInput;
};

export type MutationGenerateLiveBackupCopyDownloadUrlArgs = {
	input: AppEnvironmentLiveBackupCopyDownloadUrlInput;
};

export type MutationGenerateMediaExportSignedUrlArgs = {
	input?: InputMaybe< AppEnvironmentGenerateMediaExportSignedUrlInput >;
};

export type MutationGeneratePhpMyAdminAccessArgs = {
	input?: InputMaybe< GeneratePhpMyAdminAccessInput >;
};

export type MutationGenerateUserTokenArgs = {
	input?: InputMaybe< UserTokenGenerationInput >;
};

export type MutationLaunchApplicationArgs = {
	input?: InputMaybe< AppEnvironmentLaunchedInput >;
};

export type MutationManageIntegrationArgs = {
	input: ManageIntegrationInput;
};

export type MutationPurgePageCacheArgs = {
	input?: InputMaybe< PurgePageCacheInput >;
};

export type MutationRemoveUserFromOrganizationArgs = {
	input?: InputMaybe< RemoveUserFromOrganizationInput >;
};

export type MutationReplaceOrganizationAuthDomainsArgs = {
	input?: InputMaybe< OrganizationAuthDomainReplaceInput >;
};

export type MutationRequestFeatureUpgradeArgs = {
	input?: InputMaybe< RequestFeatureUpgradeInput >;
};

export type MutationResendInvitationArgs = {
	input?: InputMaybe< ResendInvitationInput >;
};

export type MutationRetireEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentRetireInput >;
};

export type MutationRollbackArgs = {
	input?: InputMaybe< RollbackInput >;
};

export type MutationSaveIdentityProviderArgs = {
	input?: InputMaybe< SaveIdentityProviderInput >;
};

export type MutationSaveOrganizationAuthDomainArgs = {
	input?: InputMaybe< OrganizationAuthDomainCreateInput >;
};

export type MutationSendTestNotificationArgs = {
	input?: InputMaybe< SendTestNotificationInput >;
};

export type MutationSetIdentityProviderValidationsArgs = {
	input: SetIdentityProviderValidationsInput;
};

export type MutationSetMetricThresholdsArgs = {
	input?: InputMaybe< SetOrUpdateMetricThresholdsInput >;
};

export type MutationSetUserApplicationRolesArgs = {
	input?: InputMaybe< SetUserApplicationRolesInput >;
};

export type MutationSetUserOrganizationRoleArgs = {
	input?: InputMaybe< UpdateUserOrganizationRoleInput >;
};

export type MutationStartCustomDeployArgs = {
	input?: InputMaybe< AppEnvironmentCustomDeployInput >;
};

export type MutationStartDbBackupCopyArgs = {
	input?: InputMaybe< AppEnvironmentStartDbBackupCopyInput >;
};

export type MutationStartImportArgs = {
	input?: InputMaybe< AppEnvironmentImportInput >;
};

export type MutationStartLiveBackupCopyArgs = {
	input: LiveBackupCopyConfigInput;
};

export type MutationStartMediaExportArgs = {
	input?: InputMaybe< StartMediaExportInput >;
};

export type MutationStartMediaImportArgs = {
	input?: InputMaybe< AppEnvironmentStartMediaImportInput >;
};

export type MutationSwitchEnvironmentPrimaryDomainArgs = {
	input?: InputMaybe< AppEnvironmentPrimaryDomainSwitchInput >;
};

export type MutationSyncEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentSyncInput >;
};

export type MutationToggleVipStatusArgs = {
	input?: InputMaybe< ToggleUserVipStatusInput >;
};

export type MutationTriggerDatabaseBackupArgs = {
	input?: InputMaybe< AppEnvironmentTriggerDbBackupInput >;
};

export type MutationTriggerWpcliCommandOnAppEnvironmentArgs = {
	input?: InputMaybe< AppEnvironmentTriggerWpcliCommandInput >;
};

export type MutationUpdateBackupShippingConfigArgs = {
	input?: InputMaybe< AppEnvironmentBackupShippingInput >;
};

export type MutationUpdateBackupShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentBackupShippingV2Input >;
};

export type MutationUpdateBackupShippingStatusV2Args = {
	input?: InputMaybe< AppEnvironmentBackupShippingUpdateStatusInput >;
};

export type MutationUpdateCertificateArgs = {
	input?: InputMaybe< UpdateCertificateInput >;
};

export type MutationUpdateCustomErrorPageConfigArgs = {
	input: UpdateCustomErrorPageConfigInput;
};

export type MutationUpdateEnvironmentSubsiteDomainArgs = {
	input?: InputMaybe< AppEnvironmentUpdateSubsiteDomainInput >;
};

export type MutationUpdateEnvironmentVariableArgs = {
	input?: InputMaybe< EnvironmentVariableInput >;
};

export type MutationUpdateHstsSettingsArgs = {
	input?: InputMaybe< AppEnvironmentHstsSettingsInput >;
};

export type MutationUpdateIpAccessRestrictionsArgs = {
	input?: InputMaybe< EdgeConfigUpdateIpAccessRestrictionsInput >;
};

export type MutationUpdateLogShippingConfigArgs = {
	input?: InputMaybe< AppEnvironmentLogShippingInput >;
};

export type MutationUpdateLogShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentLogShippingV2Input >;
};

export type MutationUpdateLogShippingStatusV2Args = {
	input?: InputMaybe< AppEnvironmentLogShippingUpdateStatusInput >;
};

export type MutationUpdateMetricThresholdsArgs = {
	input?: InputMaybe< SetOrUpdateMetricThresholdsInput >;
};

export type MutationUpdateNotificationRecipientArgs = {
	input?: InputMaybe< UpdateNotificationRecipientInput >;
};

export type MutationUpdateNotificationSubscriptionArgs = {
	input?: InputMaybe< UpdateNotificationSubscriptionInput >;
};

export type MutationUpdatePluginArgs = {
	input?: InputMaybe< CodebaseUpdatePluginInput >;
};

export type MutationUpdateSoftwareSettingsArgs = {
	input?: InputMaybe< AppEnvironmentSoftwareSettingsInput >;
};

export type MutationUpdateUserArgs = {
	input?: InputMaybe< UpdateUserInput >;
};

export type MutationUpdateUserAgentAccessRestrictionsArgs = {
	input?: InputMaybe< EdgeConfigUpdateUserAgentAccessRestrictionsInput >;
};

export type MutationUpdateWpSiteLaunchStatusArgs = {
	input?: InputMaybe< WpSiteLaunchStatusInput >;
};

export type MutationValidateBackupShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentBackupShippingV2Input >;
};

export type MutationValidateCustomDeployAccessArgs = {
	input?: InputMaybe< ValidateCustomDeployAccessInput >;
};

export type MutationValidateEmailVerificationTokenArgs = {
	input: ValidateEmailVerificationTokenInput;
};

export type MutationValidateLogShippingConfigArgs = {
	input?: InputMaybe< AppEnvironmentLogShippingInput >;
};

export type MutationValidateLogShippingConfigV2Args = {
	input?: InputMaybe< AppEnvironmentLogShippingV2Input >;
};

export type MutationVerifyDnsTxtRecordArgs = {
	input?: InputMaybe< VerifyDnsTxtRecordInput >;
};

export type NetworkSiteResult = {
	__typename?: 'NetworkSiteResult';
	home_url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	url?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type NetworkSitesResult = {
	__typename?: 'NetworkSitesResult';
	blueprint?: Maybe< Blueprint >;
	items?: Maybe< Array< Maybe< InflatedNetworkSite > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type NewDomain = {
	name: Scalars[ 'String' ][ 'input' ];
};

export type NewRelicUser = {
	email: Scalars[ 'String' ][ 'output' ];
	id: Scalars[ 'Int' ][ 'output' ];
	name: Scalars[ 'String' ][ 'output' ];
};

export type NewRelicUserList = {
	__typename?: 'NewRelicUserList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes: Array< Maybe< NewRelicUser > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type NotificationRecipient = {
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type NotificationRecipientList = {
	__typename?: 'NotificationRecipientList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes: Array< Maybe< NotificationRecipient > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type NotificationRecipientMetaInput = {
	webhookVersion?: InputMaybe< NotificationWebhookVersion >;
};

export type NotificationRecipientType =
	| 'EMAIL'
	| 'GOOGLE_CHAT'
	| 'MICROSOFT_TEAMS'
	| 'SLACK'
	| 'WEBHOOK';

export type NotificationSubscription = {
	__typename?: 'NotificationSubscription';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	application?: Maybe< App >;
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	entityType: Scalars[ 'String' ][ 'output' ];
	entityValue: Scalars[ 'String' ][ 'output' ];
	id: Scalars[ 'Int' ][ 'output' ];
	meta?: Maybe< NotificationSubscriptionMeta >;
	notificationRecipient?: Maybe< NotificationRecipient >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	vin?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type NotificationSubscriptionList = {
	__typename?: 'NotificationSubscriptionList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes: Array< Maybe< NotificationSubscription > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type NotificationSubscriptionMeta = {
	__typename?: 'NotificationSubscriptionMeta';
	eventTypes?: Maybe< Array< Scalars[ 'String' ][ 'output' ] > >;
};

export type NotificationSubscriptionMetaInput = {
	eventTypes?: InputMaybe< Array< Scalars[ 'String' ][ 'input' ] > >;
};

export type NotificationWebhookVersion = 'v0' | 'v1';

export type ObjectStorageConfigInput = {
	object_storage_config_gcp?: InputMaybe< CloudShippingObjectStorageConfigGcpInput >;
	object_storage_config_s3?: InputMaybe< CloudShippingObjectStorageConfigS3Input >;
	provider: CloudShippingObjectStorageProviders;
};

export type OrgList = ModelList & {
	__typename?: 'OrgList';
	edges?: Maybe< Array< Maybe< Organization > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< Organization > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type OrgRequestStatsList = {
	__typename?: 'OrgRequestStatsList';
	nodes: Array< Maybe< SiteRequestStat > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type OrgRole = {
	__typename?: 'OrgRole';
	extends?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type OrgRoleId = 'admin' | 'member' | 'viewer';

export type Organization = Model & {
	__typename?: 'Organization';
	apps?: Maybe< AppList >;
	authDomains?: Maybe< OrganizationAuthDomainList >;
	considerUsersInactiveAfterDays?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	contacts?: Maybe< OrganizationContacts >;
	enforceSSOAccess?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	events?: Maybe< AuditEventList >;
	features?: Maybe< Array< Maybe< OrganizationFeature > > >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	identityProviders?: Maybe< IdentityProviderList >;
	integration?: Maybe< Integration >;
	integrations?: Maybe< IntegrationClientList >;
	invitations?: Maybe< InvitationList >;
	isFedramp?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	letsEncryptDisallowed?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationRecipients?: Maybe< NotificationRecipientList >;
	notificationSubscription?: Maybe< NotificationSubscription >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	pageviews?: Maybe< Pageviews >;
	permissions?: Maybe< Array< Maybe< PermissionResult > > >;
	plan?: Maybe< OrganizationPlan >;
	requestStats?: Maybe< OrgRequestStatsList >;
	salesforceId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	serviceStatus?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	slug?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	supportPackage?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	traffic?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	trafficType?: Maybe< TrafficType >;
	users?: Maybe< UserList >;
	visitorsStats?: Maybe< VisitorsStatsList >;
};

export type OrganizationAppsArgs = {
	active?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	appType?: InputMaybe< Array< InputMaybe< Scalars[ 'Int' ][ 'input' ] > > >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type OrganizationAuthDomainsArgs = {
	domain?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type OrganizationEventsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	excludeAnomalyEvents?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	order?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type OrganizationIdentityProvidersArgs = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type OrganizationIntegrationArgs = {
	slug: Scalars[ 'String' ][ 'input' ];
};

export type OrganizationInvitationsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	status?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type OrganizationNotificationRecipientsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type OrganizationNotificationSubscriptionArgs = {
	id: Scalars[ 'Int' ][ 'input' ];
};

export type OrganizationNotificationSubscriptionsArgs = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	notificationRecipientId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	vin?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type OrganizationPermissionsArgs = {
	permissions?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type OrganizationRequestStatsArgs = {
	from?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
	to?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
};

export type OrganizationUsersArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	authMethod?: InputMaybe< UserAuthMethod >;
	externalUsers?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	isVIP?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type OrganizationVisitorsStatsArgs = {
	days?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	from?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
	to?: InputMaybe< Scalars[ 'Date' ][ 'input' ] >;
};

export type OrganizationAuthDomain = Model & {
	__typename?: 'OrganizationAuthDomain';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	domain?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	organizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type OrganizationAuthDomainCreateInput = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	domain: Scalars[ 'String' ][ 'input' ];
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type OrganizationAuthDomainDeleteInput = {
	id: Scalars[ 'Int' ][ 'input' ];
};

export type OrganizationAuthDomainDeletePayload = {
	__typename?: 'OrganizationAuthDomainDeletePayload';
	deleted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type OrganizationAuthDomainList = ModelList & {
	__typename?: 'OrganizationAuthDomainList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< OrganizationAuthDomain > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type OrganizationAuthDomainPayload = {
	__typename?: 'OrganizationAuthDomainPayload';
	authDomain?: Maybe< OrganizationAuthDomain >;
};

export type OrganizationAuthDomainReplaceInput = {
	domains: Array< Scalars[ 'String' ][ 'input' ] >;
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type OrganizationAuthDomainReplacePayload = {
	__typename?: 'OrganizationAuthDomainReplacePayload';
	authDomains?: Maybe< Array< Maybe< OrganizationAuthDomain > > >;
	organization?: Maybe< Organization >;
};

export type OrganizationContact = {
	__typename?: 'OrganizationContact';
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	title?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type OrganizationContactList = {
	__typename?: 'OrganizationContactList';
	nodes?: Maybe< Array< Maybe< OrganizationContact > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type OrganizationContacts = {
	__typename?: 'OrganizationContacts';
	accountOwners?: Maybe< OrganizationContactList >;
	supportContacts?: Maybe< OrganizationContactList >;
	technicalContacts?: Maybe< OrganizationContactList >;
	vipLaunchTAM?: Maybe< OrganizationContact >;
	vipRelationshipManager?: Maybe< OrganizationContact >;
	vipTechnicalAccountManager?: Maybe< OrganizationContact >;
};

export type OrganizationFeature = {
	__typename?: 'OrganizationFeature';
	enabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	slug?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type OrganizationPlan = {
	__typename?: 'OrganizationPlan';
	addOns?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	codeReviewLevel?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	numberOfAllowedApplications?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	planEndDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	planIncludedRequests?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	planName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	planStartDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	ticketSLA?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	traffic?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	trafficType?: Maybe< TrafficType >;
	uptimeSLA?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type PhpMyAdminStatus = {
	__typename?: 'PHPMyAdminStatus';
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type PageviewDetails = {
	__typename?: 'PageviewDetails';
	apiRequests?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	appRequests?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	endDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	startDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	staticRequests?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type Pageviews = {
	__typename?: 'Pageviews';
	apiRequests?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	appRequests?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	details?: Maybe< Array< Maybe< PageviewDetails > > >;
	endDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	startDate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	staticRequests?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	total?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type PermissionResult = {
	__typename?: 'PermissionResult';
	isAllowed?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	permission?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type PrimaryDomainSwitchJob = JobInterface & {
	__typename?: 'PrimaryDomainSwitchJob';
	completedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	inProgressLock?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	metadata?: Maybe< Array< Maybe< JobMetadata > > >;
	newDomain?: Maybe< Domain >;
	progress?: Maybe< JobProgress >;
	type?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type PurgePageCacheInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	environmentId: Scalars[ 'Int' ][ 'input' ];
	urls: Array< Scalars[ 'String' ][ 'input' ] >;
};

export type PurgePageCachePayload = {
	__typename?: 'PurgePageCachePayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
	urls: Array< Scalars[ 'String' ][ 'output' ] >;
};

export type Query = {
	__typename?: 'Query';
	app?: Maybe< App >;
	apps?: Maybe< AppList >;
	certificate?: Maybe< Certificate >;
	dbBackupCopies?: Maybe< DbBackupCopyList >;
	domain?: Maybe< Domain >;
	domains?: Maybe< DomainList >;
	integrationCenter?: Maybe< IntegrationCenterList >;
	integrationCenterCategories?: Maybe< IntegrationCenterCategoryList >;
	listIntegrations?: Maybe< IntegrationList >;
	listPurposeTokens?: Maybe< TokenList >;
	me?: Maybe< Me >;
	mediaImportConfig?: Maybe< MediaImportConfig >;
	organization?: Maybe< Organization >;
	organizations?: Maybe< OrgList >;
	repo?: Maybe< Repo >;
	user?: Maybe< User >;
	users?: Maybe< UserList >;
};

export type QueryAppArgs = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryAppsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	ids?: InputMaybe< Array< InputMaybe< Scalars[ 'Int' ][ 'input' ] > > >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type QueryCertificateArgs = {
	certificateId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	clientId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryDbBackupCopiesArgs = {
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	fileNames?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type QueryDomainArgs = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type QueryDomainsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	wildcards?: InputMaybe< Array< InputMaybe< Scalars[ 'String' ][ 'input' ] > > >;
};

export type QueryIntegrationCenterArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	category?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	search?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	slug?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type QueryListIntegrationsArgs = {
	applicationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryListPurposeTokensArgs = {
	environmentIds: Array< InputMaybe< Scalars[ 'Int' ][ 'input' ] > >;
	purpose: Scalars[ 'String' ][ 'input' ];
	userId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryOrganizationArgs = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryOrganizationsArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type QueryRepoArgs = {
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type QueryUserArgs = {
	githubUsername?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type QueryUsersArgs = {
	after?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	externalUsers?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	first?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	isVIP?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	matching?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type RemoveUserFromOrganizationInput = {
	organizationId: Scalars[ 'Int' ][ 'input' ];
	userId: Scalars[ 'Int' ][ 'input' ];
};

export type RemoveUserFromOrganizationPayload = {
	__typename?: 'RemoveUserFromOrganizationPayload';
	user?: Maybe< User >;
};

export type Repo = Model & {
	__typename?: 'Repo';
	apps?: Maybe< AppList >;
	branch?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type RequestFeatureUpgradeInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	feature: Scalars[ 'String' ][ 'input' ];
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type RequestFeatureUpgradePayload = {
	__typename?: 'RequestFeatureUpgradePayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type RequestHeader = {
	name: Scalars[ 'String' ][ 'input' ];
	value: Scalars[ 'String' ][ 'input' ];
};

export type RequestStats = {
	__typename?: 'RequestStats';
	apiA8cCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	apiA8cUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	apiCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	apiUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	appA8cCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	appA8cUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	appCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	appUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	date?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	staticA8cCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	staticA8cUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	staticCached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
	staticUncached?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type RequestStatsList = {
	__typename?: 'RequestStatsList';
	nodes?: Maybe< Array< Maybe< RequestStats > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type ResendInvitationInput = {
	invitationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type ResendInvitationPayload = {
	__typename?: 'ResendInvitationPayload';
	invitation?: Maybe< Invitation >;
};

export type ResponseHeader = {
	__typename?: 'ResponseHeader';
	name: Scalars[ 'String' ][ 'output' ];
	value: Scalars[ 'String' ][ 'output' ];
};

export type ReviewQueue = {
	__typename?: 'ReviewQueue';
	repos?: Maybe< Array< Maybe< Repo > > >;
};

export type RollbackInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	toDeploymentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type RollbackPayload = {
	__typename?: 'RollbackPayload';
	newDeployment?: Maybe< Deployment >;
};

export type SaveIdentityProviderInput = {
	active: Scalars[ 'Boolean' ][ 'input' ];
	certificate: Scalars[ 'String' ][ 'input' ];
	displayName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	entryPoint?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	issuer?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	organizationId: Scalars[ 'Int' ][ 'input' ];
	provider: Scalars[ 'String' ][ 'input' ];
	secondaryCertificate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	slug?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type SaveIdentityProviderPayload = {
	__typename?: 'SaveIdentityProviderPayload';
	identityProvider?: Maybe< IdentityProvider >;
};

export type SendTestNotificationInput = {
	body?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	header?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	notificationRecipientId: Scalars[ 'Int' ][ 'input' ];
	organizationId: Scalars[ 'Int' ][ 'input' ];
};

export type SendTestNotificationPayload = {
	__typename?: 'SendTestNotificationPayload';
	sent?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type ServerResponse = {
	__typename?: 'ServerResponse';
	headers: Array< ResponseHeader >;
	statusCode: Scalars[ 'Int' ][ 'output' ];
};

export type SetIdentityProviderValidationsInput = {
	id: Scalars[ 'Int' ][ 'input' ];
	organizationId: Scalars[ 'Int' ][ 'input' ];
	validateAudience: Scalars[ 'Boolean' ][ 'input' ];
	wantAssertionsSigned: Scalars[ 'Boolean' ][ 'input' ];
	wantAuthnResponseSigned: Scalars[ 'Boolean' ][ 'input' ];
};

export type SetIdentityProviderValidationsPayload = {
	__typename?: 'SetIdentityProviderValidationsPayload';
	id: Scalars[ 'Int' ][ 'output' ];
	organizationId: Scalars[ 'Int' ][ 'output' ];
	validateAudience: Scalars[ 'Boolean' ][ 'output' ];
	wantAssertionsSigned: Scalars[ 'Boolean' ][ 'output' ];
	wantAuthnResponseSigned: Scalars[ 'Boolean' ][ 'output' ];
};

export type SetOrUpdateMetricThresholdPayload = {
	__typename?: 'SetOrUpdateMetricThresholdPayload';
	success: Scalars[ 'Boolean' ][ 'output' ];
	thresholds?: Maybe< Array< Maybe< MetricThreshold > > >;
};

export type SetOrUpdateMetricThresholdsInput = {
	envId: Scalars[ 'Int' ][ 'input' ];
	metricName: Scalars[ 'String' ][ 'input' ];
	thresholds: Array< InputMaybe< MetricThresholdInput > >;
};

export type SetUserApplicationRolesInput = {
	applicationRoles: Array< InputMaybe< UserApplicationRoleInput > >;
};

export type SetUserApplicationRolesPayload = {
	__typename?: 'SetUserApplicationRolesPayload';
	applicationRoles?: Maybe< Array< Maybe< UserApplicationRole > > >;
};

export type SiteRequestStat = {
	__typename?: 'SiteRequestStat';
	billableApiRequestCount: Scalars[ 'BigInt' ][ 'output' ];
	billableAppRequestCount: Scalars[ 'BigInt' ][ 'output' ];
	clientSiteId: Scalars[ 'BigInt' ][ 'output' ];
	dailyBillableApiRequestCount: Scalars[ 'BigInt' ][ 'output' ];
	dailyBillableAppRequestCount: Scalars[ 'BigInt' ][ 'output' ];
	date: Scalars[ 'String' ][ 'output' ];
	resolution: Scalars[ 'String' ][ 'output' ];
};

export type SlackNotificationRecipient = NotificationRecipient & {
	__typename?: 'SlackNotificationRecipient';
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type StartMediaExportConfigOptions = {
	regex?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	subsiteId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type StartMediaExportInput = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	config?: InputMaybe< StartMediaExportConfigOptions >;
	environmentId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type StartMediaExportPayload = {
	__typename?: 'StartMediaExportPayload';
	mediaExport?: Maybe< MediaExport >;
	message?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type Stats = {
	__typename?: 'Stats';
	dailyUniqueVisitorsCount?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	date: Scalars[ 'String' ][ 'output' ];
	monthlyUniqueVisitorsCount: Scalars[ 'Int' ][ 'output' ];
};

export type StatsList = {
	__typename?: 'StatsList';
	nodes: Array< Maybe< Stats > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type ToggleUserVipStatusInput = {
	githubUsername: Scalars[ 'String' ][ 'input' ];
	isVIP?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type ToggleUserVipStatusPayload = {
	__typename?: 'ToggleUserVIPStatusPayload';
	user?: Maybe< User >;
};

export type Token = Model & {
	__typename?: 'Token';
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	disabledDueToInactivity?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	environmentIds?: Maybe< Array< Maybe< Scalars[ 'Int' ][ 'output' ] > > >;
	exp?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	expiresAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	lastUsedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	purpose?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	userId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type TokenList = ModelList & {
	__typename?: 'TokenList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes: Array< Token >;
	total: Scalars[ 'Int' ][ 'output' ];
};

export type TrafficType = 'HTTP' | 'MUV';

export type UpdateCertificateInput = {
	certificate: Scalars[ 'String' ][ 'input' ];
	certificateId: Scalars[ 'Int' ][ 'input' ];
	clientId: Scalars[ 'Int' ][ 'input' ];
	domainName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	trustedCertificate?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type UpdateCertificatePayload = {
	__typename?: 'UpdateCertificatePayload';
	certificate?: Maybe< Certificate >;
};

export type UpdateCustomErrorPageConfigInput = {
	content?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	environmentId: Scalars[ 'Int' ][ 'input' ];
	strategy: CustomErrorPageConfigStrategy;
};

export type UpdateNotificationRecipientInput = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	description?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	id: Scalars[ 'Int' ][ 'input' ];
	meta?: InputMaybe< NotificationRecipientMetaInput >;
	name?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	organizationId: Scalars[ 'Int' ][ 'input' ];
	recipientType?: InputMaybe< NotificationRecipientType >;
	recipientValue?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type UpdateNotificationRecipientPayload = {
	__typename?: 'UpdateNotificationRecipientPayload';
	notificationRecipient?: Maybe< NotificationRecipient >;
};

export type UpdateNotificationSubscriptionInput = {
	active?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
	description?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	entityType?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	entityValue?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	meta?: InputMaybe< NotificationSubscriptionMetaInput >;
	notificationRecipientId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	notificationSubscriptionId: Scalars[ 'Int' ][ 'input' ];
	vin?: InputMaybe< Scalars[ 'Boolean' ][ 'input' ] >;
};

export type UpdateNotificationSubscriptionPayload = {
	__typename?: 'UpdateNotificationSubscriptionPayload';
	notificationSubscription?: Maybe< NotificationSubscription >;
};

export type UpdateUserInput = {
	displayName?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	emailAddress?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	githubUsername?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	userId: Scalars[ 'Int' ][ 'input' ];
};

export type UpdateUserOrganizationRoleInput = {
	organizationId: Scalars[ 'Int' ][ 'input' ];
	role?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
	userId: Scalars[ 'Int' ][ 'input' ];
};

export type UpdateUserOrganizationRolePayload = {
	__typename?: 'UpdateUserOrganizationRolePayload';
	organizationRole?: Maybe< UserOrganizationRole >;
	user?: Maybe< User >;
};

export type UpdateUserPayload = {
	__typename?: 'UpdateUserPayload';
	user?: Maybe< User >;
};

export type User = Model & {
	__typename?: 'User';
	applicationRoles?: Maybe< UserApplicationRoleList >;
	auth0Id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	authMethod?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailAddress?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	emailVerification?: Maybe< EmailVerificationTokenData >;
	githubUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	isConsideredInactive?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isEmailLegacyUnverified?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isEmailVerified?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	isVipAuthUser?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	lastSeenAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	mfaMethods?: Maybe< MfaMethods >;
	organizationRoles?: Maybe< UserOrganizationRoleList >;
	samlIdentityProviderName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	samlNameId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	samlOrganizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	tokens?: Maybe< Array< Maybe< Token > > >;
	trackingUserId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	vipAuthId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	wpcomUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type UserApplicationRolesArgs = {
	appId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type UserOrganizationRolesArgs = {
	organizationId?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
	roleId?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type UserApplicationRole = Model & {
	__typename?: 'UserApplicationRole';
	app?: Maybe< App >;
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	role?: Maybe< ApplicationRole >;
	roleId?: Maybe< ApplicationRoleId >;
	source?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	userId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type UserApplicationRoleInput = {
	appId: Scalars[ 'Int' ][ 'input' ];
	roleId?: InputMaybe< ApplicationRoleId >;
	userId: Scalars[ 'Int' ][ 'input' ];
};

export type UserApplicationRoleList = ModelList & {
	__typename?: 'UserApplicationRoleList';
	edges?: Maybe< Array< Maybe< UserApplicationRole > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< UserApplicationRole > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type UserAuthMethod = 'github' | 'organization_sso' | 'other_sso' | 'restricted' | 'wpcom';

export type UserList = ModelList & {
	__typename?: 'UserList';
	edges?: Maybe< Array< Maybe< User > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< User > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type UserOrganizationRole = Model & {
	__typename?: 'UserOrganizationRole';
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	organization?: Maybe< Organization >;
	organizationId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	restricted?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	restrictedBy?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	restrictedOrgName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	role?: Maybe< OrgRole >;
	roleId?: Maybe< OrgRoleId >;
	source?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	userId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type UserOrganizationRoleList = ModelList & {
	__typename?: 'UserOrganizationRoleList';
	edges?: Maybe< Array< Maybe< UserOrganizationRole > > >;
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< UserOrganizationRole > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type UserTokenGenerationInput = {
	lifetime?: InputMaybe< Scalars[ 'String' ][ 'input' ] >;
};

export type UserTokenGenerationPayload = {
	__typename?: 'UserTokenGenerationPayload';
	jwt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type VipprMeta = {
	__typename?: 'VIPPRMeta';
	comments?: Maybe< Array< Maybe< GitHubComment > > >;
	reviewComments?: Maybe< Array< Maybe< GitHubPullRequestReviewComment > > >;
	reviews?: Maybe< Array< Maybe< GitHubReview > > >;
};

export type ValidateCustomDeployAccessInput = {
	app: Scalars[ 'String' ][ 'input' ];
	env: Scalars[ 'String' ][ 'input' ];
};

export type ValidateCustomDeployAccessPayload = {
	__typename?: 'ValidateCustomDeployAccessPayload';
	appId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	envId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	envType?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	envUniqueLabel?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	launched?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	primaryDomainName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type ValidateEmailVerificationTokenInput = {
	token: Scalars[ 'String' ][ 'input' ];
};

export type ValidateEmailVerificationTokenPayload = {
	__typename?: 'ValidateEmailVerificationTokenPayload';
	email?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type ValidatePhpMyAdminAccessPayload = {
	__typename?: 'ValidatePhpMyAdminAccessPayload';
	success?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type VerifyDnsTxtRecordInput = {
	id?: InputMaybe< Scalars[ 'Int' ][ 'input' ] >;
};

export type VerifyDnsTxtRecordPayload = {
	__typename?: 'VerifyDnsTxtRecordPayload';
	valid?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
};

export type VisitorsStats = {
	__typename?: 'VisitorsStats';
	parselySiteId: Scalars[ 'String' ][ 'output' ];
	stats: StatsList;
};

export type VisitorsStatsList = {
	__typename?: 'VisitorsStatsList';
	nodes: Array< Maybe< VisitorsStats > >;
	total: Scalars[ 'BigInt' ][ 'output' ];
};

export type WpcliCommand = {
	__typename?: 'WPCLICommand';
	command?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	createdAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	endedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	environmentId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	guid?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	startedAt?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	status?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	user?: Maybe< WpcliCommandUser >;
	userId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type WpcliCommandList = {
	__typename?: 'WPCLICommandList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< WpcliCommand > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type WpcliCommandUser = {
	__typename?: 'WPCLICommandUser';
	displayName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	githubUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	isVIP?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	wpcomUsername?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WpCliSshAuthentication = {
	__typename?: 'WPCliSSHAuthentication';
	host: Scalars[ 'String' ][ 'output' ];
	passphrase: Scalars[ 'String' ][ 'output' ];
	port: Scalars[ 'String' ][ 'output' ];
	privateKey: Scalars[ 'String' ][ 'output' ];
	username: Scalars[ 'String' ][ 'output' ];
};

export type WpInstallation = {
	__typename?: 'WPInstallation';
	/** Core WordPress Site Installation Details */
	core?: Maybe< WpInstallationCoreDetails >;
	/** App Environment Name */
	environmentName?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Details about Jetpack */
	jetpack?: Maybe< WpInstallationJetpackDetails >;
	/** Details about all plugins installed */
	plugins?: Maybe< Array< WpInstallationPluginDetails > >;
	/** App Environment / GOOP Site ID */
	siteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Last updated timestamp of the Site Installation Details */
	timestamp?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type WpInstallationCoreDetails = {
	__typename?: 'WPInstallationCoreDetails';
	/** Is WordPress Multisite Installation */
	isMultisite?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** WordPress Installation PHP Version */
	phpVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress Installation Version */
	wpVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WpInstallationJetpackDetails = {
	__typename?: 'WPInstallationJetpackDetails';
	/** Is Jetpack available on WordPress Installation */
	available?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Jetpack Version */
	version?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** VIP Jetpack Version */
	vipVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WpInstallationPluginDetails = {
	__typename?: 'WPInstallationPluginDetails';
	/** WordPress Plugin activated by */
	activatedBy?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Is WordPress Plugin active */
	active: Scalars[ 'Boolean' ][ 'output' ];
	/** WordPress Plugin update download link */
	downloadLink?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress Plugin available update version */
	hasUpdate?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress Plugin marketplace */
	marketplace?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress Plugin name */
	name: Scalars[ 'String' ][ 'output' ];
	/** WordPress Plugin path */
	path: Scalars[ 'String' ][ 'output' ];
	/** WordPress Plugin slug */
	slug?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress Plugin version */
	version: Scalars[ 'String' ][ 'output' ];
};

export type WpSite = {
	__typename?: 'WPSite';
	/** WordPress Site/Blog ID */
	blogId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** List of WordPress PHP defines/constants used in the blog */
	constants?: Maybe< Array< Maybe< WpSitePhpConstants > > >;
	/** WordPress Home URL option */
	homeUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** [DEPRECATING SOON] Alias for blogId */
	id?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** WP Site Installation Details */
	installation?: Maybe< WpInstallation >;
	/** [DEPRECATING SOON] Is blog active */
	isActive?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Jetpack Details */
	jetpack?: Maybe< WpSiteJetpackDetails >;
	/** [DEPRECATING SOON] Alias for jetpack */
	jetpackDetails?: Maybe< WpSiteJetpackDetails >;
	/** Launched status of the subsite */
	launchStatus?: Maybe< WpSiteLaunchStatus >;
	/** Details about Parse.ly plugin (wp-parsely) usage */
	parsely?: Maybe< WpSiteParselyDetails >;
	/** List of enabled plugins on the blog */
	plugins?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
	/** WordPress Site URL option */
	siteUrl?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Last updated timestamp of the Site Details */
	timestamp?: Maybe< Scalars[ 'BigInt' ][ 'output' ] >;
};

export type WpSiteJetpackDetails = {
	__typename?: 'WPSiteJetpackDetails';
	/** Is Jetpack Active */
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** [DEPRECATING SOON] Jetpack Cache Site ID */
	cacheSiteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	/** Jetpack Cache Site ID */
	id?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Enabled Jetpack modules */
	modules?: Maybe< Array< Maybe< Scalars[ 'String' ][ 'output' ] > > >;
};

export type WpSiteLaunchStatus = 'LAUNCHED' | 'LAUNCHING' | 'NOT_LAUNCHED' | 'UNKNOWN';

/** Variables for the UpdateWPSiteLaunchStatus mutation */
export type WpSiteLaunchStatusInput = {
	/** Unique ID of the application */
	appId: Scalars[ 'Int' ][ 'input' ];
	/** Unique ID of the environment */
	environmentId: Scalars[ 'Int' ][ 'input' ];
	/** Updated launch status of the network site */
	launchStatus: WpSiteLaunchStatus;
	/** ID of the network site (subsite) being updated */
	networkSiteId: Scalars[ 'Int' ][ 'input' ];
};

/** Variables for the UpdateWPSiteLaunchStatus mutation */
export type WpSiteLaunchStatusPayload = {
	__typename?: 'WPSiteLaunchStatusPayload';
	app?: Maybe< App >;
	environment?: Maybe< AppEnvironment >;
	/** Updated launch status of the network site */
	launchStatus?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** ID of the network site (subsite) being updated */
	networkSiteId?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type WpSiteList = {
	__typename?: 'WPSiteList';
	nextCursor?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	nodes?: Maybe< Array< Maybe< WpSite > > >;
	total?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
};

export type WpSiteParselyConfigs = {
	__typename?: 'WPSiteParselyConfigs';
	/** Does the site have a Parse.ly API Secret configured? */
	haveApiSecret?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is autotrack disabled (to allow Dynamic Tracking to be used)? */
	isAutotrackingDisabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is JavaScript Tracking disabled? */
	isJavascriptDisabled?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is the site pinned to the specific plugin version? */
	isPinnedVersion?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Is JavaScript tracking enabled for logged in users? */
	shouldTrackLoggedInUsers?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Parse.ly Site ID (aka apikey) */
	siteId?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Details about tracked post types */
	trackedPostTypes?: Maybe< Array< Maybe< WpSiteParselyTrackedPostTypesConfig > > >;
};

export type WpSiteParselyDetails = {
	__typename?: 'WPSiteParselyDetails';
	/** Is wp-parsely active? */
	active?: Maybe< Scalars[ 'Boolean' ][ 'output' ] >;
	/** Details about how the plugin is configured on site */
	configs?: Maybe< WpSiteParselyConfigs >;
	/** How wp-parsely is activated (if active) */
	integrationType?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** Version for the wp-parsely plugin */
	version?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WpSiteParselyTrackedPostTypesConfig = {
	__typename?: 'WPSiteParselyTrackedPostTypesConfig';
	/** The slug for the post type */
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** How is the post type tracked within Parse.ly? (post, non-post, or do-not-track) */
	trackType?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WpSitePhpConstants = {
	__typename?: 'WPSitePhpConstants';
	/** WordPress PHP Define/Constant key */
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	/** WordPress PHP Define/Constant value */
	value?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};

export type WebhookNotificationRecipient = NotificationRecipient & {
	__typename?: 'WebhookNotificationRecipient';
	createdAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	description?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	id: Scalars[ 'Int' ][ 'output' ];
	meta?: Maybe< WebhookRecipientMeta >;
	name?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	notificationSubscriptions?: Maybe< NotificationSubscriptionList >;
	organizationId: Scalars[ 'Int' ][ 'output' ];
	recipientType?: Maybe< NotificationRecipientType >;
	recipientValue?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	updatedAt?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
};

export type WebhookRecipientMeta = {
	__typename?: 'WebhookRecipientMeta';
	lastResponse?: Maybe< Scalars[ 'String' ][ 'output' ] >;
	lastResponseCode?: Maybe< Scalars[ 'Int' ][ 'output' ] >;
	lastResponseTime?: Maybe< Scalars[ 'Date' ][ 'output' ] >;
	webhookVersion?: Maybe< Scalars[ 'String' ][ 'output' ] >;
};
