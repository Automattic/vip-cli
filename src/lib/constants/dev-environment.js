export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-env';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DEV_ENVIRONMENT_DEFAULTS = {
	title: 'VIP Dev',
	multisite: false,
	elasticsearchVersion: '7.10.1',
	mariadbVersion: '10.3',
	phpImage: 'ghcr.io/automattic/vip-container-images/php-fpm:7.4',
};

export const DEV_ENVIRONMENT_PROMPT_INTRO = 'This is a wizard to help you set up your local dev environment.\n\n' +
	'Sensible default values were pre-selected for convenience. ' +
	'You may also choose to create multiple environments with different settings using the --slug option.\n\n';
export const DEV_ENVIRONMENT_NOT_FOUND = 'Environment not found.';

export const DEV_ENVIRONMENT_COMPONENTS = [ 'wordpress', 'muPlugins', 'clientCode' ];

export const DEV_ENVIRONMENT_RAW_GITHUB_HOST = 'raw.githubusercontent.com';

export const DEV_ENVIRONMENT_WORDPRESS_VERSIONS_URI = '/Automattic/vip-container-images/master/wordpress/versions.json';

export const DEV_ENVIRONMENT_WORDPRESS_CACHE_KEY = 'wordpress-versions.json';

export const DEV_ENVIRONMENT_WORDPRESS_VERSION_TTL = 86400; // once per day

