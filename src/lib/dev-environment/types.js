// @flow
export interface InstanceOptions {
	title: string;
	multisite: boolean;
	wordpress?: string;
	muPlugins?: string;
	appCode?: string;
	elasticsearch?: boolean;
	mariadb?: string;
	php?: string;
	mediaRedirectDomain?: string;
	statsd?: boolean;
	phpmyadmin?: boolean;
	xdebug?: boolean;
	xdebugConfig?: string;
	mailhog?: boolean;

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

export interface InstanceData {
	siteSlug: string;
	wpTitle: string;
	multisite: boolean;
	wordpress: WordPressConfig;
	muPlugins: ComponentConfig;
	appCode: ComponentConfig;
	mediaRedirectDomain: string;
	statsd: boolean;
	phpmyadmin: boolean;
	xdebug: boolean;
	xdebugConfig?: string;
	mariadb: string;
	php: string;
	elasticsearch?: string | boolean;
	mailhog: boolean;

	[index: string]: WordPressConfig | ComponentConfig | string | boolean;
}
