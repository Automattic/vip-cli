export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-env';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DEV_ENVIRONMENT_DEFAULTS = {
	title: 'VIP Dev',
	multisite: false,
	elasticsearchVersion: '7.10.1',
	mariadbVersion: '10.3',
};

export const DEV_ENVIRONMENT_MODE_IMAGE = 'image';

export const DEV_ENVIRONMENT_MODE_LOCAL = 'local';

export const DEV_ENVIRONMENT_MODE_INHERIT = 'inherit';

export const DEV_ENVIRONMENT_PROMPT_INTRO = 'This is a wizard to help you set up your local dev environment.\n\n' +
	'Sensible default values were pre-selected for convenience. ' +
	'You may also choose to create multiple environments with different settings using the --slug option.\n\n';

export const DEV_ENVIRONMENT_WAIT_MESSAGE = 'Fetching WordPress. Please stand by...';

export const DEV_ENVIRONMENT_COMPONENTS = [ 'wordpress', 'muPlugins', 'clientCode' ];

export const DEV_ENVIRONMENT_GIT_URL = 'http://github.com/WordPress/WordPress.git';