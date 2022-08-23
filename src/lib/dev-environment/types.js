// @flow
export interface InstanceOptions {
	title: string;
	multisite: boolean;
	wordpress?: string;
	muPlugins?: string;
	clientCode?: string;
	elasticsearchEnabled?: boolean;
	elasticsearch?: string;
	mariadb?: string;
	php?: string;
	mediaRedirectDomain?: string;
	statsd?: boolean;
	phpmyadmin?: boolean;
	xdebug?: boolean;
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
	};
}

export type ComponentConfig = {
	mode: 'local' | 'image';
	dir?: string;
	image?: string;
	tag?: string;
}

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
	wordpress: ComponentConfig;
	muPlugins: ComponentConfig;
	clientCode: ComponentConfig;
	mediaRedirectDomain: string;
	statsd: boolean;
	phpmyadmin: boolean;
	xdebug: boolean;
	elasticsearch: string;
	mariadb: string;
	php: string;
}
