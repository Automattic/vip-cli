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
import ejs from 'ejs';
import path from 'path';
import Lando from 'lando/lib/lando';
import landoUtils from 'lando/plugins/lando-core/lib/utils';
import chalk from 'chalk';

/**
 * Internal dependencies
 */

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

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
	phpVersion: '7.4',
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

const landoFileTemplatePath = path.join( __dirname, '..', '..', 'assets', 'dev-environment.lando.template.yml.ejs' );
const landoFileName = '.lando.yml';

export async function startEnvironment( slug ) {
	debug( 'Will start an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoStart( instancePath );
}

export async function stopEnvironment( slug ) {
	debug( 'Will stop an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoStop( instancePath );
}

export async function createEnvironment( slug, options ) {
	debug( 'Will start an environment', slug, 'with options: ', options );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( alreadyExists ) {
		throw new Error( 'Environment already exists.' );
	}

	const instanceData = generateInstanceData( slug, options );

	debug( 'Instance data to create a new environment:', instanceData );

	await prepareLandoEnv( instanceData, instancePath );
}

export async function destroyEnvironment( slug ) {
	debug( 'Will destroy an environment', slug );
	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoDestroy( instancePath );
	fs.rmdirSync( instancePath, { recursive: true } );
}

export async function printEnvironmentInfo( slug ) {
	debug( 'Will get info for an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	const appInfo = await landoInfo( instancePath );

	const lando = new Lando( getLandoConfig() );
	console.log( lando.cli.formatData( appInfo, { format: 'table' }, { border: false } ) );
}

function getLandoConfig() {
	const landoPath = path.join( __dirname, '..', '..', 'node_modules', 'lando' );

	debug( `Getting lando config, using path '${ landoPath }' for plugins` );

	return {
		logLevelConsole: 'warn',
		landoFile: '.lando.yml',
		preLandoFiles: [ '.lando.base.yml', '.lando.dist.yml', '.lando.upstream.yml' ],
		postLandoFiles: [ '.lando.local.yml' ],
		pluginDirs: [
			landoPath,
			{
				path: path.join( landoPath, 'integrations' ),
				subdir: '.',
			},
		],
	};
}

async function landoStart( instancePath ) {
	debug( 'Will start lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.start();

	console.log( lando.cli.formatData( landoUtils.startTable( app ), { format: 'table' }, { border: false } ) );
}

async function landoStop( instancePath ) {
	debug( 'Will stop lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.stop();
}

async function landoDestroy( instancePath ) {
	debug( 'Will destroy lando app on path:', instancePath );
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.destroy();
}

async function landoInfo( instancePath ) {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	const appInfo = landoUtils.startTable( app );

	const reachableServices = app.info.filter( service => service.urls.length );
	reachableServices.forEach( service => appInfo[ `${ service.service } urls` ] = service.urls );
	const urls = reachableServices.map( service => service.urls ).flat();

	const scanResult = await app.scanUrls( urls, { max: 1 } );
	// If all the URLs are reachable than the app is considered 'up'
	const isUp = scanResult?.length && scanResult.filter( result => result.status ).length === scanResult.length;
	appInfo.status = isUp ? chalk.green( 'UP' ) : chalk.yellow( 'DOWN' );

	return appInfo;
}

async function prepareLandoEnv( instanceData, instancePath ) {
	const landoFile = await ejs.renderFile( landoFileTemplatePath, instanceData );

	const landoFileTargetPath = path.join( instancePath, landoFileName );

	fs.mkdirSync( instancePath, { recursive: true } );
	fs.writeFileSync( landoFileTargetPath, landoFile );

	debug( `Lando file created in ${ landoFileTargetPath }` );
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

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', name );
}
