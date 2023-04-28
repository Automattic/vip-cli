// @flow
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

	[index: string]: string | boolean;
}

export type AppInfo = {
	id?: number;
	name?: string;
	repository?: string;
	environment?: {
		name: string;
		type: string;
		branch: string;
		isMultisite: boolean;
		primaryDomain: string;
		php: string;
		wordpress: string;
	};
}

export type ComponentConfig = {
	mode: 'local' | 'image';
	dir?: string;
	image?: string;
	tag?: string;
}

export type WordPressConfig = {
	mode: 'image';
	tag: string;
	ref?: string;
	doNotUpgrade?: boolean;
};

export type EnvironmentNameOptions = {
	slug: string;
	app: string;
	env: string;
	allowAppEnv?: boolean;
}

export type ConfigurationFileOptions = {
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
}

export interface InstanceData {
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
	pullAfter?: number;

	[index: string]: WordPressConfig | ComponentConfig | string | boolean;
}
