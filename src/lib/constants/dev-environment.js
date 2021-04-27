export const DEV_ENVIRONMENT_SUBCOMMAND = 'dev-environment';
export const DEV_ENVIRONMENT_FULL_COMMAND = `vip ${ DEV_ENVIRONMENT_SUBCOMMAND }`;

export const DEV_ENVIRONMENT_CONTAINER_IMAGES = {
	wordpress: {
		image: 'wpvipdev/wordpress',
		tag: '5.6',
		allTags: [
			'5.7.1',
			'5.7',
			'5.6.3',
			'5.6',
			'5.5.1',
			'5.5.2',
			'5.5',
			'5.4.2',
			'5.3.4',
		],
	},
	jetpack: {
		image: 'wpvipdev/jetpack',
		allTags: [
			'8.9.1',
			'8.9',
			'8.8.2',
			'8.8',
		],
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

[ 'wordpress', 'muPlugins', 'clientCode' ].forEach( type => {
	DEV_ENVIRONMENT_DEFAULTS[ type ] = {
		mode: 'image',
		image: DEV_ENVIRONMENT_CONTAINER_IMAGES[ type ].image,
		tag: DEV_ENVIRONMENT_CONTAINER_IMAGES[ type ].tag,
	};
} );

export const DEV_ENVIRONMENT_PROMPT_INTRO = 'This is a wizard to help you set up you local dev environment.\n\n' +
	'Sensible defaualt values were pre-selected for convinience. ' +
	'You can also choose to create multiple different environments with different settings using the --slug option.\n\n';
