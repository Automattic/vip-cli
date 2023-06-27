export interface InstanceOptions {
	title?: string;
	multisite?: boolean | 'subdomain' | 'subdirectory';
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
	mailhog?: boolean; // Legacy
	mailpit?: boolean;
	photon?: boolean;

	[ index: string ]: unknown;
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
	multisite?: boolean | 'subdomain' | 'subdirectory';
	php?: string;
	wordpress?: string;
	'mu-plugins'?: string;
	'app-code'?: string;
	elasticsearch?: boolean;
	phpmyadmin?: boolean;
	xdebug?: boolean;
	'xdebug-config'?: string;
	mailhog?: boolean; // Legacy
	mailpit?: boolean;
	'media-redirect-domain'?: string;
	photon?: boolean;

	[ index: string ]: unknown;
}

export interface InstanceData {
	[ index: string ]: unknown;
	siteSlug: string;
	wpTitle: string;
	multisite: boolean | 'subdomain' | 'subdirectory';
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
	mailhog?: boolean; // Legacy
	mailpit: boolean;
	photon: boolean;
	pullAfter?: number;
	autologinKey?: string;
}
