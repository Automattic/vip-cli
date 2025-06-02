export type MultisiteKind = 'subdomain' | 'subdirectory';

export interface InstanceOptions {
	title?: string;
	multisite?: boolean | MultisiteKind;
	wordpress?: string;
	muPlugins?: string;
	appCode?: string;
	elasticsearch?: boolean;
	mariadb?: string; // Legacy
	php?: string;
	mediaRedirectDomain?: string;
	phpmyadmin?: boolean;
	xdebug?: boolean;
	xdebugConfig?: string;
	mailpit?: boolean;
	photon?: boolean;
	cron?: boolean;
	overrides?: string;
	adminPassword?: string;

	[ index: string ]: unknown;
}

export interface IntergrationSettings {
	status: string;
	config?: Record< string, unknown >;
}

export interface IntegrationConfig {
	type?: string;
	org?: IntergrationSettings;
	env?: IntergrationSettings;
	network_sites?: IntergrationSettings;
}

export interface AppInfo {
	id?: number | null;
	name?: string | null;
	repository?: string | null;
	environment?: {
		name?: string | null;
		type?: string | null;
		branch?: string | null;
		isMultisite?: boolean | null;
		primaryDomain: string;
		php: string;
		wordpress: string;
		integrations: Record< string, IntegrationConfig >;
		envVars: Record< string, string >;
	};
}

export interface ComponentConfig {
	mode: 'local' | 'image';
	dir?: string;
	image?: string;
	tag?: string;
}

export interface WordPressConfig {
	mode: 'image';
	tag: string;
	ref?: string;
	doNotUpgrade?: boolean;
}

export interface EnvironmentNameOptions {
	slug: string;
	app: string;
	env: string;
	allowAppEnv?: boolean;
}

export interface ConfigurationFileOptions {
	version?: string;
	slug?: string;
	title?: string;
	multisite?: boolean | MultisiteKind;
	php?: string;
	wordpress?: string;
	'mu-plugins'?: string;
	'app-code'?: string;
	elasticsearch?: boolean;
	phpmyadmin?: boolean;
	xdebug?: boolean;
	'xdebug-config'?: string;
	mailpit?: boolean;
	'media-redirect-domain'?: string;
	photon?: boolean;
	cron?: boolean;
	overrides?: string;

	meta?: ConfigurationFileMeta;
	[ index: string ]: unknown;
}

export interface ConfigurationFileMeta {
	'configuration-path': string;
}

export interface InstanceData {
	[ index: string ]: unknown;
	siteSlug: string;
	wpTitle: string;
	multisite: boolean | MultisiteKind;
	wordpress: WordPressConfig;
	muPlugins: ComponentConfig;
	appCode: ComponentConfig;
	mediaRedirectDomain: string;
	phpmyadmin: boolean;
	xdebug: boolean;
	xdebugConfig?: string;
	mariadb?: string; // Legacy
	php: string;
	elasticsearch?: string | boolean;
	mailpit: boolean;
	photon: boolean;
	cron: boolean;
	pullAfter?: number;
	autologinKey?: string;
	adminPassword?: string;
	version?: string;
	overrides?: string;
}

export type EditorType = 'vscode' | 'cursor' | 'phpstorm' | 'windsurf';
