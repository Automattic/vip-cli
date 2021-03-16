/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import xdgBasedir from 'xdg-basedir';
import os from 'os';
import fs from 'fs';

/**
 * Internal dependencies
 */

const debug = debugLib('@automattic/vip:bin:dev-environment');

const containerImages = {
	wordpress: {
		image: 'wpvipdev/wordpress',
		tag: '5.6',
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

export const defaults = {
	environmentSlug: 'vip-local',
	title: 'VIP Dev',
	multisite: false,
	phpVersion: '7.3',
	jetpack: {
		mode: 'inherit',
	},
	wordpress: {},
	muPlugins: {},
	clientCode: {},
};

[ 'wordpress', 'muPlugins', 'clientCode' ].forEach( type => {
	defaults[ type ] = {
		mode: 'image',
		image: containerImages[ type ].image,
		tag: containerImages[ type ].tag,
	};
} );

export async function startEnvironment( slug, options ) {
	debug('Will create environment', slug, 'with options: ', options);

	const instancePath = getEnvironmentPath( slug );

	const alreadyExists = fs.existsSync( instancePath );
	// if ( fs.existsSync( instancePath ) ) {
	// 	return console.error( 'Instance ' + name + ' already exists' );
	// }
	// fs.mkdirSync( instancePath );

	if ( alreadyExists ) {
		const parameters = Object
			.keys( options || {} )
			.filter( key => key !== 'slug' );
		if ( parameters ) {
			throw new Error(
				`The environment ${ slug } already exists and we can not change it's configuration` +
				`( configuration parameters - ${ parameters.join( ', ' ) } found ).` +
				' Destroy the environment first if you would like to recreate it.')
		}
	} else {
		const instanceData = generateInstanceData( slug, options );
	}

	// const instanceData = {
	// 	siteSlug: slug,
	// 	wpTitle: options.title || 'VIP Dev',
	// 	multisite: options.multisite || false,
	// 	wordpress: {},
	// 	muPlugins: {},
	// 	jetpack: {},
	// 	clientCode: {},
	// };

	// updateSiteDataWithOptions( instanceData, options );

	// await prepareLandoEnv( instanceData, instancePath );

	// console.log( instanceData );
	// fs.writeFileSync( instancePath + '/instanceData.json', JSON.stringify( instanceData ) );

	// if ( options.start ) {
	// 	landoStart( instancePath );
	// 	console.log( 'Lando environment created on directory "' + instancePath + '" and started.' );
	// } else {
	// 	console.log( 'Lando environment created on directory "' + instancePath + '".' );
	// 	console.log( 'You can cd into that directory and run "lando start"' );
	// }
}

export function generateInstanceData( slug, options ) {
	const instanceData = {
		siteSlug: slug,
		wpTitle: options.title || defaults.title,
		multisite: options.multisite || defaults.multisite,
		phpVersion: options.phpVersion || defaults.phpVersion,
		wordpress: getParamInstanceData( options.wordpress, 'wordpress' ),
		muPlugins: getParamInstanceData( options.muPlugins, 'muPlugins' ),
		jetpack: getParamInstanceData( options.jetpack, 'jetpack' ),
		clientCode: getParamInstanceData( options.clientCode, 'clientCode' ),
	};

	return instanceData;
}

function getParamInstanceData( param, type ) {
	if ( param ) {
		if ( param.includes( '/' ) ) {
			return {
				mode: 'local',
				dir: param,
			};
		}

		if ( type === 'jetpack' && param === 'mu' ) {
			return {
				mode: 'inherit',
			};
		}

		return {
			mode: 'image',
			image: containerImages[ type ].image,
			tag: param,
		};
	}

	return defaults[ type ];
}

export function getEnvironmentPath( name ) {
	if ( ! name ) {
		throw new Error( 'Name was not provided' );
	}

	const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();

	return `${ mainEnvironmentPath }/vip/dev-environment/${ name }`;
}
