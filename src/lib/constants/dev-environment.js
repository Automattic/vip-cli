export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-env';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DOCKER_HUB_PAGE_SIZE = 10;
export const DOCKER_HUB_WP_IMAGES = `https://hub.docker.com/v2/repositories/wpvipdev/wordpress/tags/?page_size=${ DOCKER_HUB_PAGE_SIZE }`;
export const DOCKER_HUB_JETPACK_IMAGES = `https://hub.docker.com/v2/repositories/wpvipdev/jetpack/tags/?page_size=${ DOCKER_HUB_PAGE_SIZE }`;

export const DEV_ENVIRONMENT_CONTAINER_IMAGES = {
	wordpress: {
		image: 'wpvipdev/wordpress',
	},
	jetpack: {
		image: 'wpvipdev/jetpack',
	},
	muPlugins: {
		image: 'wpvipdev/mu-plugins',
		tag: 'auto',
	},
	clientCode: {
		image: 'wpvipdev/skeleton',
		tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
	},
};

export const DEV_ENVIRONMENT_DEFAULTS = {
	title: 'VIP Dev',
	multisite: false,
	phpVersion: '7.4',
	jetpack: {
		mode: 'inherit',
	},
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

export const DEV_ENVIRONMENT_PROMPT_INTRO = 'This is a wizard to help you set up you local dev environment.\n\n' +
	'Sensible defaualt values were pre-selected for convinience. ' +
	'You can also choose to create multiple different environments with different settings using the --slug option.\n\n';
