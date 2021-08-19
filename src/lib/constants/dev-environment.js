export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-env';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DEV_ENVIRONMENT_CONTAINER_IMAGES = {
	wordpress: {
		image: 'ghcr.io/automattic/vip-container-images/wordpress',
	},
	muPlugins: {
		image: 'ghcr.io/automattic/vip-container-images/mu-plugins',
		tag: 'latest',
	},
	clientCode: {
		image: 'ghcr.io/automattic/vip-container-images/skeleton',
		tag: 'latest',
	},
};

export const DEV_ENVIRONMENT_DEFAULTS = {
	title: 'VIP Dev',
	multisite: false,
	phpVersion: '7.4',
	elasticSearchVersion: '7.5.1',
	wordpress: {},
	muPlugins: {},
	clientCode: {},
};

[ 'muPlugins', 'clientCode' ].forEach( type => {
	DEV_ENVIRONMENT_DEFAULTS[ type ] = {
		mode: 'image',
		image: DEV_ENVIRONMENT_CONTAINER_IMAGES[ type ].image,
		tag: DEV_ENVIRONMENT_CONTAINER_IMAGES[ type ].tag,
	};
} );

export const DEV_ENVIRONMENT_PROMPT_INTRO = 'This is a wizard to help you set up your local dev environment.\n\n' +
	'Sensible default values were pre-selected for convenience. ' +
	'You may also choose to create multiple environments with different settings using the --slug option.\n\n';

export const DEV_ENVIRONMENT_COMPONENTS = [ 'wordpress', 'muPlugins', 'clientCode' ];
