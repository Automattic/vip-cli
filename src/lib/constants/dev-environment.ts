export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-env';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DEV_ENVIRONMENT_DEFAULTS = {
	title: 'VIP Dev',
	multisite: false,
	phpVersion: '8.0',
} as const;

export const DEV_ENVIRONMENT_PROMPT_INTRO =
	'This is a wizard to help you set up your local dev environment.\n\n' +
	'Sensible default values were pre-selected for convenience. ' +
	'You may also choose to create multiple environments with different settings using the --slug option.\n\n';
export const DEV_ENVIRONMENT_NOT_FOUND = 'Environment not found.';

export const DEV_ENVIRONMENT_COMPONENTS = [ 'muPlugins', 'appCode' ] as const;
export const DEV_ENVIRONMENT_COMPONENTS_WITH_WP = [
	'wordpress',
	...DEV_ENVIRONMENT_COMPONENTS,
] as const;

export const DEV_ENVIRONMENT_RAW_GITHUB_HOST = 'raw.githubusercontent.com';

export const DEV_ENVIRONMENT_WORDPRESS_VERSIONS_URI =
	'/Automattic/vip-container-images/master/wordpress/versions.json';

export const DEV_ENVIRONMENT_WORDPRESS_CACHE_KEY = 'wordpress-versions.json';

export const DEV_ENVIRONMENT_WORDPRESS_VERSION_TTL = 86400; // once per day

interface PhpImage {
	image: string;
	label: string;
}

export const DEV_ENVIRONMENT_PHP_VERSIONS: Record< string, PhpImage > = {
	8.1: { image: 'ghcr.io/automattic/vip-container-images/php-fpm:8.1', label: '8.1 (recommended)' },
	8.2: {
		image: 'ghcr.io/automattic/vip-container-images/php-fpm:8.2',
		label: '8.2 (experimental)',
	},
	8.3: {
		image: 'ghcr.io/automattic/vip-container-images/php-fpm:8.3',
		label: '8.3 (experimental, not supported)',
	},
	'8.0': {
		image: 'ghcr.io/automattic/vip-container-images/php-fpm:8.0',
		label: '8.0 (EOL soon)',
	},
	7.4: { image: 'ghcr.io/automattic/vip-container-images/php-fpm:7.4', label: '7.4 (EOL; not supported)' },
} as const;

export const DEV_ENVIRONMENT_VERSION = '2.0.0';
